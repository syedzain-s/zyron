'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { warnNoWebGL } from './webgl';

interface Props {
  children: ReactNode;
  fallback: ReactNode;
  label?: string;
}

interface State {
  failed: boolean;
}

/**
 * three.js throws "Error creating WebGL context" from inside a layout effect,
 * which React treats as a fatal render error and which takes the whole page
 * down. A boundary is the only way to catch it. One dead canvas should cost a
 * background, not the site.
 */
export class CanvasBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    warnNoWebGL(this.props.label ?? 'scene');
    console.warn('[zyron] canvas error', error.message, info.componentStack);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
