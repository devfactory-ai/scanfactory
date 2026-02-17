import { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { offlineStorage, ScanHistoryItem, PendingUpload } from '../lib/offline';
import { api } from '../lib/api';

interface HistoryScreenProps {
  onScanPress?: () => void;
}

export function HistoryScreen({ onScanPress }: HistoryScreenProps) {
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [localHistory, pending] = await Promise.all([
        offlineStorage.getHistory(),
        offlineStorage.getPendingUploads(),
      ]);
      setHistory(localHistory);
      setPendingUploads(pending);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const syncWithServer = useCallback(async () => {
    if (!api.isAuthenticated()) return;

    setSyncing(true);
    try {
      // Upload pending documents
      const pending = await offlineStorage.getPendingUploads();
      for (const upload of pending) {
        if (upload.retryCount >= 3) continue; // Skip failed uploads

        try {
          const result = await api.scanDocument(upload.imageUri, upload.pipelineId);
          await offlineStorage.completePendingUpload(upload.localId, {
            id: result.id,
            status: result.status,
            confidence_score: result.confidence_score,
          });
        } catch (error) {
          const err = error as Error;
          await offlineStorage.failPendingUpload(upload.localId, err.message);
        }
      }

      // Fetch server history
      try {
        const serverData = await api.getMyDocuments({ limit: 50 });
        await offlineStorage.mergeServerHistory(serverData.documents);
      } catch {
        // Ignore server fetch errors
      }

      // Reload local data
      await loadData();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncing(false);
    }
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await syncWithServer();
    setRefreshing(false);
  };

  const retryUpload = async (localId: string) => {
    const pending = pendingUploads.find((p) => p.localId === localId);
    if (!pending) return;

    try {
      const result = await api.scanDocument(pending.imageUri, pending.pipelineId);
      await offlineStorage.completePendingUpload(localId, {
        id: result.id,
        status: result.status,
        confidence_score: result.confidence_score,
      });
      await loadData();
    } catch (error) {
      const err = error as Error;
      await offlineStorage.failPendingUpload(localId, err.message);
      await loadData();
      Alert.alert('Erreur', err.message);
    }
  };

  const cancelUpload = async (localId: string) => {
    Alert.alert(
      'Annuler l\'envoi',
      'Voulez-vous supprimer ce document en attente ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui',
          style: 'destructive',
          onPress: async () => {
            await offlineStorage.removePendingUpload(localId);
            await loadData();
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: ScanHistoryItem['status']) => {
    switch (status) {
      case 'pending':
        return '#f59e0b';
      case 'uploaded':
        return '#3b82f6';
      case 'validated':
        return '#10b981';
      case 'rejected':
        return '#ef4444';
      case 'error':
        return '#dc2626';
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status: ScanHistoryItem['status']) => {
    switch (status) {
      case 'pending':
        return 'En attente d\'envoi';
      case 'uploaded':
        return 'Envoyé';
      case 'validated':
        return 'Validé';
      case 'rejected':
        return 'Rejeté';
      case 'error':
        return 'Erreur';
      default:
        return status;
    }
  };

  const formatConfidence = (score: number | null): string => {
    if (score === null) return '-';
    return `${Math.round(score * 100)}%`;
  };

  const renderItem = ({ item }: { item: ScanHistoryItem }) => {
    const isPending = item.status === 'pending' || item.status === 'error';

    return (
      <View style={styles.historyItem}>
        <View style={styles.itemHeader}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {getStatusLabel(item.status)}
            </Text>
          </View>
          {item.confidence_score !== null && (
            <Text style={styles.confidence}>{formatConfidence(item.confidence_score)}</Text>
          )}
        </View>

        <Text style={styles.pipelineName}>{item.pipeline_display_name}</Text>
        <Text style={styles.date}>{formatDate(item.created_at)}</Text>

        {item.error && (
          <Text style={styles.errorText}>{item.error}</Text>
        )}

        {isPending && (
          <View style={styles.pendingActions}>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => retryUpload(item.localId)}
            >
              <Text style={styles.retryButtonText}>Réessayer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => cancelUpload(item.localId)}
            >
              <Text style={styles.cancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>Aucun historique</Text>
      <Text style={styles.emptyText}>
        Vos documents numérisés apparaîtront ici
      </Text>
      {onScanPress && (
        <TouchableOpacity style={styles.scanButton} onPress={onScanPress}>
          <Text style={styles.scanButtonText}>Scanner un document</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1e40af" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Historique</Text>
        {syncing && (
          <View style={styles.syncIndicator}>
            <ActivityIndicator size="small" color="#1e40af" />
            <Text style={styles.syncText}>Synchronisation...</Text>
          </View>
        )}
      </View>

      {/* Pending uploads count */}
      {pendingUploads.length > 0 && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingBannerText}>
            {pendingUploads.length} document{pendingUploads.length > 1 ? 's' : ''} en attente d'envoi
          </Text>
        </View>
      )}

      {/* History list */}
      <FlatList
        data={history}
        keyExtractor={(item) => item.localId || item.id}
        renderItem={renderItem}
        contentContainerStyle={history.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#1e40af"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  syncIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncText: {
    fontSize: 12,
    color: '#1e40af',
    marginLeft: 6,
  },
  pendingBanner: {
    backgroundColor: '#fef3c7',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#fcd34d',
  },
  pendingBannerText: {
    fontSize: 14,
    color: '#92400e',
    fontWeight: '500',
  },
  list: {
    padding: 20,
  },
  emptyList: {
    flex: 1,
  },
  historyItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  confidence: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  pipelineName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  date: {
    fontSize: 14,
    color: '#6b7280',
  },
  errorText: {
    fontSize: 12,
    color: '#dc2626',
    marginTop: 8,
  },
  pendingActions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10,
  },
  retryButton: {
    flex: 1,
    backgroundColor: '#1e40af',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  scanButton: {
    backgroundColor: '#1e40af',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
