import React from 'react';
import { SafeAreaView } from 'react-native';
import PdfViewerScreen from './src/PdfViewerScreen';

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <PdfViewerScreen />
    </SafeAreaView>
  );
}
