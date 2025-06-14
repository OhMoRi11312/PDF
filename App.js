import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Button, Text, Platform, ActivityIndicator, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';

export default function App() {
  const [pdfUri, setPdfUri] = useState(null);
  const [webViewHtml] = useState(() => {
    // PDF.js 라이브러리와 PDF를 캔버스에 렌더링하는 스크립트 포함
    return `
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js"></script>
        <style>
          body {
            margin: 0;
            padding: 0;
            overflow-x: hidden; /* 가로 스크롤 방지 */
            overflow-y: auto; /* 세로 스크롤 허용 */
            display: flex;
            flex-direction: column; /* 세로로 페이지 배치 */
            align-items: center;
            height: 100vh; /* 뷰포트 높이 전체 사용 */
            width: 100vw; /* 뷰포트 너비 전체 사용 */
            background-color: #f0f0f0;
          }
          .page-container {
            margin-bottom: 15px; /* 페이지 간 간격 */
            border: 1px solid #ccc;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            background-color: white; /* 페이지 배경색 */
            display: flex;
            justify-content: center;
            align-items: center;
            /* 캔버스가 이 컨테이너 안에 정렬되도록 */
          }
          canvas {
            display: block; /* 캔버스 자체의 마진/패딩 문제 방지 */
          }
        </style>
      </head>
      <body>
        <div id="pdfViewerContainer" style="width: 100%; display: flex; flex-direction: column; align-items: center; padding-top: 15px;"></div>
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

          let currentPdfRenderTask = null; // 현재 렌더링 작업을 추적

          async function renderPdf(base64Data) {
            if (!base64Data) {
                console.log("No PDF data received.");
                return;
            }
            console.log("Attempting to render PDF with PDF.js...");

            // 이전 렌더링 작업이 있다면 취소
            if (currentPdfRenderTask) {
                try {
                    currentPdfRenderTask.cancel();
                    console.log("Cancelled previous PDF rendering task.");
                } catch (e) {
                    console.warn("Error cancelling previous task:", e);
                }
            }

            // PDF 뷰어 컨테이너 비우기 (이전 PDF 내용 제거)
            const viewerContainer = document.getElementById('pdfViewerContainer');
            viewerContainer.innerHTML = ''; 

            try {
                const binaryString = atob(base64Data);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const loadingTask = pdfjsLib.getDocument({ data: bytes });
                currentPdfRenderTask = loadingTask; // 현재 작업 저장

                const pdf = await loadingTask.promise;
                console.log('PDF loaded, total pages:', pdf.numPages);

                // 고해상도 렌더링을 위한 디바이스 픽셀 비율
                const outputScale = window.devicePixelRatio || 1;

                // 모든 페이지 렌더링
                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    const page = await pdf.getPage(pageNum);
                    console.log('Rendering page', pageNum);

                    const viewport = page.getViewport({ scale: 1 });
                    // 웹뷰의 너비에 맞춰 스케일 계산
                    // 뷰포트 너비는 100%로 설정되어 있으므로 window.innerWidth 사용
                    const scale = (window.innerWidth - 30) / viewport.width; // 좌우 여백 15px씩 고려
                    const scaledViewport = page.getViewport({ scale: scale });

                    // 각 페이지를 담을 div 컨테이너 생성
                    const pageContainer = document.createElement('div');
                    pageContainer.className = 'page-container';
                    viewerContainer.appendChild(pageContainer);

                    // 새로운 캔버스 요소 생성
                    const canvas = document.createElement('canvas');
                    pageContainer.appendChild(canvas); // 캔버스를 페이지 컨테이너에 추가

                    const context = canvas.getContext('2d');

                    // 캔버스 실제 픽셀 크기 (선명도 개선)
                    canvas.width = Math.floor(scaledViewport.width * outputScale);
                    canvas.height = Math.floor(scaledViewport.height * outputScale);

                    // 캔버스 표시 크기 (CSS)
                    canvas.style.width = Math.floor(scaledViewport.width) + 'px';
                    canvas.style.height = Math.floor(scaledViewport.height) + 'px';

                    // 고해상도 렌더링을 위한 컨텍스트 변환
                    context.scale(outputScale, outputScale);

                    const renderContext = {
                        canvasContext: context,
                        viewport: scaledViewport,
                    };
                    await page.render(renderContext).promise;
                }
                console.log('All PDF pages rendered successfully on canvas.');
                // React Native로 성공 메시지 전송
                if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'success', message: 'PDF rendered' }));
                }
            } catch (error) {
                if (error.name === 'RenderingCancelledException') {
                    console.log('PDF rendering cancelled.');
                } else {
                    console.error('Error rendering PDF:', error);
                    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: error.message }));
                    }
                }
            } finally {
                currentPdfRenderTask = null; // 작업 완료 또는 취소 후 초기화
            }
          }

          // React Native로부터 메시지 수신 리스너
          document.addEventListener('message', (event) => {
            console.log('Message from RN:', event.data);
            const data = JSON.parse(event.data);
            if (data.type === 'loadPdf' && data.base64Pdf) {
              renderPdf(data.base64Pdf);
            }
          });

          // WebView가 준비되었음을 React Native에 알림
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'webviewReady' }));
          }
        </script>
      </body>
      </html>
    `;
  });

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [base64Pdf, setBase64Pdf] = useState(null);
  const webViewRef = useRef(null);
  const [webViewReady, setWebViewReady] = useState(false);

  const pickPdf = async () => {
    try {
      setError(null);
      setPdfUri(null);
      setBase64Pdf(null); // 새로운 선택 시 Base64 데이터 초기화
      setLoading(true);

      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
      });

      console.log('DocumentPicker result:', result);

      if (result.canceled) {
        console.log('PDF 선택 취소');
        setLoading(false);
        return;
      }

      if (result.assets && result.assets.length > 0) {
        const selectedUri = result.assets[0].uri;
        console.log('Selected PDF original URI:', selectedUri);

        let fileBase64 = null;
        try {
          fileBase64 = await FileSystem.readAsStringAsync(selectedUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          console.log('PDF file successfully read as Base64.');
          setBase64Pdf(fileBase64); // Base64 데이터를 상태에 저장 (useEffect가 이를 감지하여 전송)
          setPdfUri(selectedUri);
          Alert.alert("PDF 로드 시작", "PDF 파일을 로드합니다. 잠시 기다려주세요.");

        } catch (fileReadError) {
          console.error('Failed to read PDF file as Base64:', fileReadError);
          setError('PDF 파일을 읽는 중 오류가 발생했습니다: ' + fileReadError.message);
        }
      } else {
        setError('선택된 PDF 파일이 없습니다.');
      }
    } catch (err) {
      console.error('Error picking PDF:', err);
      setError('PDF 파일을 선택하는 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const onWebViewMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('Message from WebView:', data);
      if (data.type === 'webviewReady') {
        setWebViewReady(true);
        console.log('WebView reports ready!');
      } else if (data.type === 'success') {
        console.log('PDF successfully rendered in WebView by PDF.js.');
        // Alert.alert("성공", "PDF 파일이 성공적으로 로드되었습니다."); // 성공 알림 추가
      } else if (data.type === 'error') {
        setError('WebView에서 PDF 렌더링 중 오류: ' + data.message);
        console.error('WebView rendering error:', data.message);
      }
    } catch (parseError) {
      console.error('Failed to parse message from WebView:', parseError);
    }
  };

  // webViewReady 상태 또는 base64Pdf 상태가 변경될 때마다 메시지 전송 시도
  useEffect(() => {
    if (webViewReady && base64Pdf && webViewRef.current) {
      console.log('useEffect: Sending PDF data to WebView...');
      webViewRef.current.postMessage(JSON.stringify({ type: 'loadPdf', base64Pdf: base64Pdf }));
    }
  }, [webViewReady, base64Pdf]);


  return (
    <View style={styles.container}>
      <Button title="PDF 파일 선택" onPress={pickPdf} disabled={loading} />

      {loading && <ActivityIndicator size="large" color="#0000ff" style={styles.indicator} />}
      
      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.pdfContainer}>
        <WebView
          ref={webViewRef}
          style={styles.webview}
          source={{ html: webViewHtml }}
          originWhitelist={['*']}
          allowsFileAccess={true}
          allowFileAccessFromFileURLs={true}
          allowUniversalAccessFromFileURLs={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          onLoadStart={() => console.log('WebView Load Start (HTML)')}
          onLoadEnd={() => console.log('WebView Load End (HTML loaded)')}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('WebView general error (loading HTML): ', nativeEvent);
            setError('WebView 로딩 중 오류: ' + nativeEvent.description);
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('WebView HTTP error (loading HTML): ', nativeEvent);
            setError('WebView HTTP 오류: ' + nativeEvent.statusCode + ' ' + nativeEvent.description);
          }}
          onMessage={onWebViewMessage}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
    backgroundColor: '#e0e0e0',
  },
  pdfContainer: {
    flex: 1,
    width: '100%',
    marginTop: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  webview: {
    flex: 1,
  },
  placeholderText: {
    marginTop: 20,
    fontSize: 16,
    color: '#888',
  },
  errorText: {
    marginTop: 10,
    color: 'red',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  indicator: {
    marginTop: 10,
  },
});
