import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, SafeAreaView } from 'react-native';

/**
 * ScanFactory Mobile App
 *
 * Minimal setup for document scanning workflow:
 * - Document scanner with camera
 * - Pipeline type selection
 * - Scan history with offline support
 * - OTP authentication
 */
export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ScanFactory</Text>
        <Text style={styles.subtitle}>Scanner de documents</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.placeholder}>Application en cours de configuration...</Text>
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#1e40af',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#93c5fd',
    marginTop: 4,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  placeholder: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
});
