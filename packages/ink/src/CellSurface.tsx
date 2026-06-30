import { type Surface, rasterizeToSegments, toHex } from "@learn-engine/core";
import { Box, Text } from "ink";

export interface CellSurfaceProps {
  readonly surface: Surface;
}

export function CellSurface({ surface }: CellSurfaceProps): React.JSX.Element {
  const rows = rasterizeToSegments(surface);

  return (
    <Box flexDirection="column">
      {rows.map((segments, y) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Surface rows have fixed spatial order and no component state.
        <Text key={y}>
          {segments.map((segment, index) => (
            <SegmentText
              // biome-ignore lint/suspicious/noArrayIndexKey: Rasterized runs are fixed within a rendered row.
              key={index}
              text={segment.text}
              fg={toHex(segment.fg)}
              bg={toHex(segment.bg)}
              bold={segment.bold}
            />
          ))}
        </Text>
      ))}
    </Box>
  );
}

interface SegmentTextProps {
  readonly text: string;
  readonly fg?: string | undefined;
  readonly bg?: string | undefined;
  readonly bold: boolean;
}

function SegmentText({
  text,
  fg,
  bg,
  bold,
}: SegmentTextProps): React.JSX.Element {
  return (
    <Text
      {...(fg === undefined ? {} : { color: fg })}
      {...(bg === undefined ? {} : { backgroundColor: bg })}
      bold={bold}
    >
      {text}
    </Text>
  );
}
