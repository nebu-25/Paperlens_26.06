import React from 'react';

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('PaperLens render error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="grid min-h-screen place-items-center bg-paper px-4 text-ink">
        <section className="w-full max-w-md rounded border border-line bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-action">화면 복구</p>
          <h1 className="mt-2 text-xl font-bold">화면을 다시 불러와야 합니다</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            브라우저 번역 또는 확장 프로그램이 본문 표시 영역을 바꾸는 동안 화면 렌더링이 중단되었습니다.
            저장된 노트는 계정과 로컬 저장소에 유지됩니다.
          </p>
          <button
            type="button"
            className="mt-4 inline-flex w-full items-center justify-center rounded bg-action px-4 py-2 text-sm font-semibold text-white"
            onClick={() => window.location.reload()}
          >
            화면 다시 불러오기
          </button>
        </section>
      </main>
    );
  }
}
