export interface ConversionResult {
  smi: string;
  cueCount: number;
}

function timeToMs(timeStr: string): number {
  const trimmed = timeStr.trim();
  const parts = trimmed.split(":");

  let hours = 0,
    minutes = 0,
    seconds = 0,
    ms = 0;

  if (parts.length === 3) {
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1], 10);
    const secParts = parts[2].split(".");
    seconds = parseInt(secParts[0], 10);
    ms = secParts[1]
      ? parseInt(secParts[1].padEnd(3, "0").substring(0, 3), 10)
      : 0;
  } else if (parts.length === 2) {
    minutes = parseInt(parts[0], 10);
    const secParts = parts[1].split(".");
    seconds = parseInt(secParts[0], 10);
    ms = secParts[1]
      ? parseInt(secParts[1].padEnd(3, "0").substring(0, 3), 10)
      : 0;
  }

  return hours * 3600000 + minutes * 60000 + seconds * 1000 + ms;
}

function stripVttTags(text: string): string {
  return (
    text
      // <v Name> voice tag → remove
      .replace(/<v[^>]*>/g, "")
      // <lang> tags → remove
      .replace(/<\/?lang[^>]*>/g, "")
      // <ruby>, <rt> tags → remove
      .replace(/<\/?ruby[^>]*>/g, "")
      .replace(/<\/?rt[^>]*>/g, "")
      // Keep <b>, <i>, <u> as-is (SMI supports basic HTML)
      // Remove <c.color> class tags but keep content
      .replace(/<c(\.[^>]*)?>([^<]*)<\/c>/g, "$2")
      // Remove remaining unknown tags
      .replace(/<(?!\/?(b|i|u))[^>]*>/gi, "")
      .trim()
  );
}

export function convertVttToSmi(vttContent: string): ConversionResult {
  const lines = vttContent
    .replace(/^﻿/, "") // Remove BOM
    .split(/\r?\n/);

  interface Cue {
    startMs: number;
    endMs: number;
    text: string;
  }

  const cues: Cue[] = [];
  let i = 0;

  // Skip WEBVTT header
  if (lines[0]?.startsWith("WEBVTT")) {
    i = 1;
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line === "") {
      i++;
      continue;
    }

    // Skip NOTE, STYLE, REGION blocks
    if (
      line.startsWith("NOTE") ||
      line.startsWith("STYLE") ||
      line.startsWith("REGION")
    ) {
      while (i < lines.length && lines[i].trim() !== "") {
        i++;
      }
      i++;
      continue;
    }

    // Check for timestamp line (may be preceded by optional cue ID)
    if (!line.includes("-->")) {
      // Could be a cue ID — check next line
      i++;
      continue;
    }

    // Parse timestamp
    const timestampMatch = line.match(/^(\d[\d:.]+)\s+-->\s+(\d[\d:.]+)/);
    if (!timestampMatch) {
      i++;
      continue;
    }

    const startMs = timeToMs(timestampMatch[1]);
    const endMs = timeToMs(timestampMatch[2]);

    i++;
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      const stripped = stripVttTags(lines[i]);
      if (stripped !== "") textLines.push(stripped);
      i++;
    }

    if (textLines.length > 0) {
      cues.push({ startMs, endMs, text: textLines.join("<br>") });
    }
  }

  // Build sync map
  const syncMap = new Map<number, string>();

  for (const cue of cues) {
    syncMap.set(cue.startMs, cue.text);
    if (!syncMap.has(cue.endMs)) {
      syncMap.set(cue.endMs, "&nbsp;");
    }
  }

  const sortedTimes = Array.from(syncMap.keys()).sort((a, b) => a - b);
  const syncLines = sortedTimes.map(
    (t) => `<SYNC start=${t}><P class=KRCC>${syncMap.get(t)}</P></SYNC>`
  );

  const smi = `<SAMI>
<HEAD>
<STYLE TYPE="text/css">
P {margin-left:8pt; margin-right:8pt; margin-bottom:2pt; margin-top:2pt; text-align:center; font-size:10pt; font-family:굴림; font-weight:normal; color:white;}
.KRCC {name:한국어; lang:ko-KR; SAMI_Type:CC;}
</STYLE>
</HEAD>
<BODY>
${syncLines.join("\n")}
</BODY>
</SAMI>`;

  return { smi, cueCount: cues.length };
}
