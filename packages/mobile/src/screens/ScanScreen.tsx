import { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Modal,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { api } from '../lib/api';

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

export function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [showPipelinePicker, setShowPipelinePicker] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const cameraRef = useRef<CameraView>(null);

  // Load pipelines on mount
  useEffect(() => {
    loadPipelines();
  }, []);

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

  const takePicture = async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });
      if (photo) {
        setCapturedImage(photo.uri);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de prendre la photo');
    }
  };

  const uploadDocument = async () => {
    if (!capturedImage || !selectedPipeline) return;

    setUploading(true);
    try {
      const scanResult = await api.scanDocument(capturedImage, selectedPipeline.id);
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
    setCapturedImage(null);
    setResult(null);
  };

  const formatConfidence = (score: number): string => {
    return `${Math.round(score * 100)}%`;
  };

  const getConfidenceColor = (score: number): string => {
    if (score >= 0.9) return '#16a34a';
    if (score >= 0.7) return '#ca8a04';
    return '#dc2626';
  };

  // Permission handling
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1e40af" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionTitle}>Accès caméra requis</Text>
          <Text style={styles.permissionText}>
            ScanFactory a besoin d'accéder à votre caméra pour numériser des documents.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
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

          <View style={styles.resultInfo}>
            <Text style={styles.resultLabel}>Statut</Text>
            <Text style={styles.resultValue}>
              {result.status === 'pending' ? 'En attente de validation' : result.status}
            </Text>
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

  // Preview view (after capture, before upload)
  if (capturedImage) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: capturedImage }} style={styles.preview} />
        <View style={styles.previewOverlay}>
          <View style={styles.previewInfo}>
            <Text style={styles.previewInfoText}>
              Type: {selectedPipeline?.display_name ?? 'Non sélectionné'}
            </Text>
          </View>
          <View style={styles.previewActions}>
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={resetScan}
              disabled={uploading}
            >
              <Text style={styles.retakeButtonText}>Reprendre</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={uploadDocument}
              disabled={uploading || !selectedPipeline}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.uploadButtonText}>Envoyer</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Camera view
  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
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

        {/* Document frame guide */}
        <View style={styles.frameGuide}>
          <View style={styles.frameCorner} />
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.flipButton}
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          >
            <Text style={styles.flipButtonText}>↻</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.captureButton}
            onPress={takePicture}
            disabled={!selectedPipeline}
          >
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
          <View style={styles.placeholder} />
        </View>
      </CameraView>

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
  camera: {
    flex: 1,
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
  frameGuide: {
    position: 'absolute',
    top: '20%',
    left: '10%',
    right: '10%',
    bottom: '30%',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 8,
  },
  frameCorner: {},
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 30,
  },
  flipButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipButtonText: {
    color: '#fff',
    fontSize: 24,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  placeholder: {
    width: 50,
    height: 50,
  },
  preview: {
    flex: 1,
    resizeMode: 'contain',
  },
  previewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 20,
  },
  previewInfo: {
    marginBottom: 20,
  },
  previewInfoText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  retakeButton: {
    backgroundColor: '#374151',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  retakeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadButton: {
    backgroundColor: '#1e40af',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
