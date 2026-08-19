/**
 * 取扱い表示記号の SVG レンダラ。
 *
 * 幾何そのものは lib/glyphSvg.ts が持つ（合成データ生成ツールと共有するため）。
 * ここは「ノード列 → JSX」の変換と、色・アクセシビリティの担当だけ。
 */

import type { Glyph } from "@/lib/symbols";
import {
  glyphNodes,
  STROKE_WIDTH,
  VIEW_H,
  VIEW_W,
  type SvgNode,
} from "@/lib/glyphSvg";

function render(node: SvgNode, key: number) {
  switch (node.tag) {
    case "path":
      return (
        <path
          key={key}
          d={node.d}
          strokeWidth={node.sw}
          fill={node.filled ? "currentColor" : undefined}
          stroke={node.filled ? "none" : undefined}
        />
      );
    case "line":
      return (
        <line
          key={key}
          x1={node.x1}
          y1={node.y1}
          x2={node.x2}
          y2={node.y2}
          strokeWidth={node.sw}
          stroke="currentColor"
        />
      );
    case "rect":
      return (
        <rect
          key={key}
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          rx={node.rx}
          strokeWidth={node.sw}
          fill={node.filled ? "currentColor" : undefined}
          stroke={node.filled ? "none" : undefined}
        />
      );
    case "circle":
      return (
        <circle
          key={key}
          cx={node.cx}
          cy={node.cy}
          r={node.r}
          strokeWidth={node.sw}
          fill={node.filled ? "currentColor" : undefined}
          stroke={node.filled ? "none" : undefined}
        />
      );
    case "text":
      return (
        <text
          key={key}
          x={node.x}
          y={node.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={node.size}
          fontWeight="700"
          fill="currentColor"
          stroke="none"
        >
          {node.value}
        </text>
      );
  }
}

export default function CareSymbol({
  glyph,
  size = 56,
  title,
}: {
  glyph: Glyph;
  size?: number;
  title?: string;
}) {
  // title を渡さない場合は、隣に必ずテキストラベルがある前提の装飾として扱う。
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width={size}
      height={(size * VIEW_H) / VIEW_W}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title && <title>{title}</title>}
      {glyphNodes(glyph).map(render)}
    </svg>
  );
}
