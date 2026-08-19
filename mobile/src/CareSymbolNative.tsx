/**
 * 記号の描画（React Native 版）。
 *
 * 幾何は Web 版とまったく同じ lib/glyphSvg.ts を読む。
 * 図形を2箇所に持つとズレるうえ、認識のテンプレートもこの幾何から作っているので、
 * ここがズレると測定値ごと無意味になる。
 */

import React from "react";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import {
  glyphNodes,
  STROKE_WIDTH,
  VIEW_H,
  VIEW_W,
  type SvgNode,
} from "../../lib/glyphSvg";
import type { Glyph } from "../../lib/symbols";

function renderNode(node: SvgNode, key: number, color: string) {
  switch (node.tag) {
    case "path":
      return (
        <Path
          key={key}
          d={node.d}
          strokeWidth={node.sw ?? STROKE_WIDTH}
          stroke={node.filled ? "none" : color}
          fill={node.filled ? color : "none"}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "line":
      return (
        <Line
          key={key}
          x1={node.x1}
          y1={node.y1}
          x2={node.x2}
          y2={node.y2}
          stroke={color}
          strokeWidth={node.sw ?? STROKE_WIDTH}
          strokeLinecap="round"
        />
      );
    case "rect":
      return (
        <Rect
          key={key}
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          rx={node.rx}
          strokeWidth={node.sw ?? STROKE_WIDTH}
          stroke={node.filled ? "none" : color}
          fill={node.filled ? color : "none"}
          strokeLinejoin="round"
        />
      );
    case "circle":
      return (
        <Circle
          key={key}
          cx={node.cx}
          cy={node.cy}
          r={node.r}
          strokeWidth={node.sw ?? STROKE_WIDTH}
          stroke={node.filled ? "none" : color}
          fill={node.filled ? color : "none"}
        />
      );
    case "text":
      return (
        <SvgText
          key={key}
          x={node.x}
          y={node.y}
          textAnchor="middle"
          fontSize={node.size}
          fontWeight="700"
          fill={color}
          // react-native-svg は dominant-baseline を全面サポートしないので
          // 文字の中心が座標に来るよう alignmentBaseline を使う
          alignmentBaseline="central"
        >
          {node.value}
        </SvgText>
      );
  }
}

export default function CareSymbolNative({
  glyph,
  size = 44,
  color = "#2b2a26",
}: {
  glyph: Glyph;
  size?: number;
  color?: string;
}) {
  return (
    <Svg
      width={size}
      height={(size * VIEW_H) / VIEW_W}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
    >
      {glyphNodes(glyph).map((n, i) => renderNode(n, i, color))}
    </Svg>
  );
}
