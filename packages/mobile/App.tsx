import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { ScanScreen } from './src/screens/ScanScreen';
import { api } from './src/lib/api';

/**
 * ScanFactory Mobile App
 *
 * Document scanning workflow:
 * - Document scanner with camera
 * - Pipeline type selection
 * - Scan history with offline support
 * - OTP authentication
 */
export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Initialize API client (load stored token)
    api.init().then(() => {
      setIsReady(true);
    });
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1e40af" />
        <StatusBar style="auto" />
      </View>
    );
  }

  // For now, show the scan screen directly
  // TODO: Add navigation between Login, Scan, and History screens
  return (
    <>
      <ScanScreen />
      <StatusBar style="light" />
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
