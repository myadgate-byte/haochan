import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || '알 수 없는 오류가 발생했습니다.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let parsedOperation = '';
      let parsedPath = '';
      let displayDetail = this.state.errorMessage;

      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed && parsed.error) {
          displayDetail = parsed.error;
          parsedOperation = parsed.operationType || '';
          parsedPath = parsed.path || '';
        }
      } catch {
        // Plain error string
      }

      return (
        <div className="min-h-screen bg-[#1E1B19] text-[#F7F2E9] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#272320] border border-[#F7F2E9]/15 rounded-xl p-8 space-y-5">
            <div className="flex items-center gap-3 text-[#A52A32]">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="font-serif-kr text-xl font-semibold text-[#F7F2E9]">
                요청 처리 중 문제가 발생했습니다
              </h2>
            </div>
            <p className="text-sm text-[#F7F2E9]/80 leading-relaxed">
              데이터베이스 접근 권한 또는 네트워크 상태를 확인해 주세요.
            </p>
            <div className="bg-[#181513] border border-[#F7F2E9]/10 rounded-lg p-4 text-xs font-mono text-[#B69358] space-y-1 break-all">
              <div>오류 내용: {displayDetail}</div>
              {parsedOperation && <div>작업 유형: {parsedOperation}</div>}
              {parsedPath && <div>경로: {parsedPath}</div>}
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#A52A32] hover:bg-[#8E2229] text-[#F7F2E9] text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>화면 새로고침</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
