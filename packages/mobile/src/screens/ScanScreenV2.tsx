/**
 * ScanScreen using @devfactory/scan-lib
 *
 * Enhanced scanning with edge detection, auto-capture,
 * quality analysis, and OCR integration.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import {
  useDocumentScanner,
  ScannerView,
  type ScannedDocument,
  type ExtractionResult,
} from '@devfactory/scan-lib';
import { api } from '../lib/api';
import * as SecureStore from 'expo-secure-store';

interface Pipeline {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
}

interface ScanResult {
  id: string;
  pipeline: { id: string; name: string; display_name: string };
  batch: { id: string; group_key: string; group_label: string };
  status: string;
  extracted_data: Record<string, unknown>;
  confidence_score: number;
}

export function ScanScreenV2() {
  // Pipeline state
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [showPipelinePicker, setShowPipelinePicker] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractionResult | null>(null);

  // Initialize scanner
  const scanner = useDocumentScanner({
    capture: {
      quality: 'high',
      autoCapture: true,
      autoCaptureDelay: 1500,
    },
    edgeDetection: {
      enabled: true,
      stabilityThreshold: 5,
    },
    ocr: {
      mode: 'remote',
      timeout: 30000,
    },
    getAuthToken: async () => {
      const token = await SecureStore.getItemAsync('auth_token');
      return token || '';
    },
  });

  // Load pipelines on mount
  useEffect(() => {
    loadPipelines();
  }, []);

  // Set up auto-capture callback
  useEffect(() => {
    scanner.onAutoCapture = async (doc: ScannedDocument) => {
      // Auto-captured document - show preview
      Alert.alert(
        'Document capturé',
        'Voulez-vous envoyer ce document ?',
        [
          { text: 'Reprendre', onPress: () => scanner.reset() },
          { text: 'Envoyer', onPress: () => uploadDocument(doc) },
        ]
      );
    };
  }, [scanner, selectedPipeline]);

  const loadPipelines = async () => {
    try {
      const data = await api.getPipelines();
      setPipelines(data.pipelines);
      if (data.pipelines.length > 0) {
        setSelectedPipeline(data.pipelines[0]);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de charger les types de documents');
    }
  };

  const handleCapture = useCallback(async () => {
    try {
      const doc = await scanner.capture();

      // Try OCR extraction
      try {
        const extracted = await scanner.extractData(doc);
        setExtractedData(extracted);
      } catch {
        // OCR optional, continue without
      }

      return doc;
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de capturer le document');
      throw error;
    }
  }, [scanner]);

  const uploadDocument = async (doc: ScannedDocument) => {
    if (!selectedPipeline) return;

    setUploading(true);
    try {
      const scanResult = await api.scanDocument(doc.processedUri, selectedPipeline.id);
      setResult(scanResult);
    } catch (error) {
      const err = error as Error & { status?: number };
      if (err.status === 401) {
        Alert.alert('Non autorisé', 'Veuillez vous reconnecter');
      } else {
        Alert.alert('Erreur', err.message ?? 'Impossible d\'envoyer le document');
      }
    } finally {
      setUploading(false);
    }
  };

  const resetScan = () => {
    scanner.reset();
    setResult(null);
    setExtractedData(null);
  };

  const formatConfidence = (score: number): string => {
    return `${Math.round(score * 100)}%`;
  };

  const getConfidenceColor = (score: number): string => {
    if (score >= 0.9) return '#16a34a';
    if (score >= 0.7) return '#ca8a04';
    return '#dc2626';
  };

  // Request permission
  if (!scanner.hasPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionTitle}>Accès caméra requis</Text>
          <Text style={styles.permissionText}>
            ScanFactory a besoin d'accéder à votre caméra pour numériser des documents.
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={scanner.requestPermission}
          >
            <Text style={styles.permissionButtonText}>Autoriser l'accès</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Result view
  if (result) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.resultContainer}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>Document numérisé</Text>
            <View
              style={[
                styles.confidenceBadge,
                { backgroundColor: getConfidenceColor(result.confidence_score) + '20' },
              ]}
            >
              <Text
                style={[
                  styles.confidenceText,
                  { color: getConfidenceColor(result.confidence_score) },
                ]}
              >
                {formatConfidence(result.confidence_score)}
              </Text>
            </View>
          </View>

          <View style={styles.resultInfo}>
            <Text style={styles.resultLabel}>Type</Text>
            <Text style={styles.resultValue}>{result.pipeline.display_name}</Text>
          </View>

          <View style={styles.resultInfo}>
            <Text style={styles.resultLabel}>Lot</Text>
            <Text style={styles.resultValue}>{result.batch.group_label}</Text>
          </View>

          <View style={styles.resultSection}>
            <Text style={styles.resultSectionTitle}>Données extraites</Text>
            {Object.entries(result.extracted_data).map(([key, value]) => (
              <View key={key} style={styles.extractedField}>
                <Text style={styles.fieldKey}>{key}</Text>
                <Text style={styles.fieldValue}>{String(value)}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.newScanButton} onPress={resetScan}>
            <Text style={styles.newScanButtonText}>Nouveau scan</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // Scanner view
  return (
    <View style={styles.container}>
      <ScannerView
        isReady={scanner.isReady}
        hasPermission={scanner.hasPermission}
        facing={scanner.facing}
        edges={scanner.edgesDetected}
        quality={scanner.qualityScore}
        countdown={scanner.autoCaptureCountdown}
        isCapturing={scanner.isCapturing}
        onCapture={handleCapture}
        onToggleFacing={scanner.toggleFacing}
        showFrameGuide={true}
        showQualityIndicator={true}
      >
        {/* Pipeline selector */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.pipelineSelector}
            onPress={() => setShowPipelinePicker(true)}
          >
            <Text style={styles.pipelineSelectorText}>
              {selectedPipeline?.display_name ?? 'Sélectionner un type'}
            </Text>
            <Text style={styles.pipelineSelectorIcon}>▼</Text>
          </TouchableOpacity>
        </View>

        {/* Batch indicator */}
        {scanner.currentBatch.length > 0 && (
          <View style={styles.batchIndicator}>
            <Text style={styles.batchText}>
              {scanner.currentBatch.length} page(s)
            </Text>
          </View>
        )}
      </ScannerView>

      {/* Uploading overlay */}
      {uploading && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.uploadingText}>Envoi en cours...</Text>
        </View>
      )}

      {/* Pipeline picker modal */}
      <Modal
        visible={showPipelinePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPipelinePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Type de document</Text>
            {pipelines.map((pipeline) => (
              <TouchableOpacity
                key={pipeline.id}
                style={[
                  styles.pipelineOption,
                  selectedPipeline?.id === pipeline.id && styles.pipelineOptionSelected,
                ]}
                onPress={() => {
                  setSelectedPipeline(pipeline);
                  setShowPipelinePicker(false);
                }}
              >
                <Text
                  style={[
                    styles.pipelineOptionText,
                    selectedPipeline?.id === pipeline.id && styles.pipelineOptionTextSelected,
                  ]}
                >
                  {pipeline.display_name}
                </Text>
                {pipeline.description && (
                  <Text style={styles.pipelineDescription}>{pipeline.description}</Text>
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowPipelinePicker(false)}
            >
              <Text style={styles.modalCloseButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  pipelineSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  pipelineSelectorText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  pipelineSelectorIcon: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 8,
  },
  batchIndicator: {
    position: 'absolute',
    top: 100,
    right: 20,
    backgroundColor: '#1e40af',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  batchText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 20,
    textAlign: 'center',
  },
  pipelineOption: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: '#f3f4f6',
  },
  pipelineOptionSelected: {
    backgroundColor: '#dbeafe',
    borderWidth: 2,
    borderColor: '#1e40af',
  },
  pipelineOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  pipelineOptionTextSelected: {
    color: '#1e40af',
  },
  pipelineDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  modalCloseButton: {
    marginTop: 10,
    padding: 16,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    fontSize: 16,
    color: '#6b7280',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: '#1e40af',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 20,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 40,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  confidenceBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  confidenceText: {
    fontSize: 14,
    fontWeight: '600',
  },
  resultInfo: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  resultLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  resultValue: {
    fontSize: 16,
    color: '#1f2937',
    fontWeight: '500',
  },
  resultSection: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
  },
  resultSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  extractedField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  fieldKey: {
    fontSize: 14,
    color: '#6b7280',
    flex: 1,
  },
  fieldValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  newScanButton: {
    backgroundColor: '#1e40af',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    alignItems: 'center',
  },
  newScanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
