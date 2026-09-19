import { View } from 'react-native';
import Svg, { Rect, Line, Path, Circle, Text as SvgText, G } from 'react-native-svg';
import { ChartSpec } from '@/types';

const COLORS = ['#0EA5E9', '#38BDF8', '#7DD3FC', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

interface Props {
  spec: ChartSpec;
  width: number;
  height: number;
}

export function ChartRenderer({ spec, width, height }: Props) {
  const PAD_L = 36;
  const PAD_R = 12;
  const PAD_T = 28;
  const PAD_B = 28;
  const plotW = Math.max(20, width - PAD_L - PAD_R);
  const plotH = Math.max(20, height - PAD_T - PAD_B);
  const values = spec.values.length ? spec.values : [1];
  const maxV = Math.max(...values.map((v) => Math.abs(v)), 1);
  const baselineY = PAD_T + plotH;

  if (spec.type === 'pie') {
    const total = values.reduce((a, b) => a + Math.abs(b), 0) || 1;
    const cx = width / 2;
    const cy = PAD_T + plotH / 2;
    const r = Math.min(plotW, plotH) / 2 - 4;
    let angle = -Math.PI / 2;
    const slices: any[] = [];
    values.forEach((v, i) => {
      const sweep = (Math.abs(v) / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(angle + sweep);
      const y2 = cy + r * Math.sin(angle + sweep);
      const large = sweep > Math.PI ? 1 : 0;
      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
      slices.push(
        <Path
          key={`slice-${i}`}
          d={d}
          fill={COLORS[i % COLORS.length]}
          stroke="#FFFFFF"
          strokeWidth={1.5}
        />
      );
      angle += sweep;
    });

    return (
      <View style={{ width, height, backgroundColor: '#FFFFFF' }}>
        <Svg width={width} height={height}>
          <SvgText x={width / 2} y={18} textAnchor="middle" fontSize={13} fontWeight="700" fill="#0F172A">
            {spec.title}
          </SvgText>
          {slices}
        </Svg>
      </View>
    );
  }

  const n = values.length;
  const slot = plotW / Math.max(n, 1);

  const gridLines = [0, 0.5, 1].map((p, i) => (
    <Line
      key={`g-${i}`}
      x1={PAD_L}
      y1={PAD_T + plotH * (1 - p)}
      x2={width - PAD_R}
      y2={PAD_T + plotH * (1 - p)}
      stroke="#E2E8F0"
      strokeWidth={1}
    />
  ));

  const yLabels = [0, 0.5, 1].map((p, i) => (
    <SvgText
      key={`y-${i}`}
      x={PAD_L - 6}
      y={PAD_T + plotH * (1 - p) + 4}
      textAnchor="end"
      fontSize={9}
      fill="#64748B"
    >
      {Math.round(maxV * p).toString()}
    </SvgText>
  ));

  const bars =
    spec.type === 'bar'
      ? values.map((v, i) => {
          const h = (Math.abs(v) / maxV) * plotH;
          const x = PAD_L + i * slot + slot * 0.15;
          const w = Math.max(4, slot * 0.7);
          const y = baselineY - h;
          return <Rect key={`bar-${i}`} x={x} y={y} width={w} height={h} fill={COLORS[i % COLORS.length]} rx={2} />;
        })
      : null;

  const lineData =
    spec.type === 'line'
      ? (() => {
          const points = values.map((v, i) => {
            const x = PAD_L + i * slot + slot / 2;
            const y = baselineY - (Math.abs(v) / maxV) * plotH;
            return { x, y };
          });
          const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          return (
            <G>
              <Path d={d} fill="none" stroke="#0EA5E9" strokeWidth={2.5} strokeLinejoin="round" />
              {points.map((p, i) => (
                <Circle key={`pt-${i}`} cx={p.x} cy={p.y} r={3.5} fill="#0EA5E9" stroke="#FFFFFF" strokeWidth={1.5} />
              ))}
            </G>
          );
        })()
      : null;

  const xLabels = values.map((_, i) => (
    <SvgText
      key={`x-${i}`}
      x={PAD_L + i * slot + slot / 2}
      y={height - 8}
      textAnchor="middle"
      fontSize={8}
      fill="#64748B"
    >
      {(spec.labels[i] || '').slice(0, 6)}
    </SvgText>
  ));

  return (
    <View style={{ width, height, backgroundColor: '#FFFFFF' }}>
      <Svg width={width} height={height}>
        <SvgText x={width / 2} y={18} textAnchor="middle" fontSize={13} fontWeight="700" fill="#0F172A">
          {spec.title}
        </SvgText>
        {gridLines}
        {yLabels}
        {bars}
        {lineData}
        {xLabels}
      </Svg>
    </View>
  );
}
