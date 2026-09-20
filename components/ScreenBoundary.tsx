import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  children: ReactNode;
  screenName: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ScreenBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    if (__DEV__) console.error(`[ScreenBoundary:${this.props.screenName}]`, error);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Screen crashed</Text>
        <Text style={styles.subtitle}>{this.props.screenName}</Text>
        <Text style={styles.error} numberOfLines={4}>{this.state.error?.message || 'Unknown error'}</Text>
        <TouchableOpacity style={styles.button} onPress={this.reset}>
          <Text style={styles.buttonText}>Reload screen</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#FF4444', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#8E8E94', fontSize: 13, marginBottom: 16 },
  error: { color: '#5A5A60', fontSize: 12, textAlign: 'center', marginBottom: 24 },
  button: { backgroundColor: '#0EA5E9', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
