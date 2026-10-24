import React, { useState } from 'react';
import { Check, Code2, Copy, Database, Download, FileText } from 'lucide-react';
import { DataPacket, MessageKind } from '../types/chat';

interface DataPacketCardProps {
  kind: MessageKind;
  packet: DataPacket;
}

export function DataPacketCard({ kind, packet }: DataPacketCardProps) {
  const [copied, setCopied] = useState(false);

  const serializeForClipboard = (): string => {
    if (kind === 'data_record') {
      const lines = [`${packet.title} (${packet.category})`];
      if (packet.fieldOneValue) {
        lines.push(`${packet.fieldOneLabel || 'Field 1'}: ${packet.fieldOneValue}`);
      }
      if (packet.fieldTwoValue) {
        lines.push(`${packet.fieldTwoLabel || 'Field 2'}: ${packet.fieldTwoValue}`);
      }
      if (packet.fieldThreeValue) {
        lines.push(`${packet.fieldThreeLabel || 'Field 3'}: ${packet.fieldThreeValue}`);
      }
      return lines.join('\n');
    }
    return packet.payloadBody || packet.title;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(serializeForClipboard());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleDownload = () => {
    let content = packet.payloadBody || '';
    let downloadName = packet.fileName || `${packet.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    let mime = packet.fileMimeType || 'text/plain;charset=utf-8';

    if (kind === 'data_record') {
      const recordObj: Record<string, string> = {
        title: packet.title,
        category: packet.category,
      };
      if (packet.fieldOneValue) {
        recordObj[packet.fieldOneLabel || 'field_1'] = packet.fieldOneValue;
      }
      if (packet.fieldTwoValue) {
        recordObj[packet.fieldTwoLabel || 'field_2'] = packet.fieldTwoValue;
      }
      if (packet.fieldThreeValue) {
        recordObj[packet.fieldThreeLabel || 'field_3'] = packet.fieldThreeValue;
      }
      content = JSON.stringify(recordObj, null, 2);
      downloadName = `${downloadName || 'record'}.json`;
      mime = 'application/json;charset=utf-8';
    } else if (kind === 'code_snippet') {
      const extMap: Record<string, string> = {
        JSON: 'json',
        CSV: 'csv',
        TypeScript: 'ts',
        Python: 'py',
        SQL: 'sql',
        Text: 'txt',
      };
      const ext = extMap[packet.codeLanguage || 'Text'] || 'txt';
      if (!downloadName.includes('.')) {
        downloadName = `${downloadName}.${ext}`;
      }
    } else if (!downloadName.includes('.')) {
      downloadName = `${downloadName}.txt`;
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const Icon =
    kind === 'data_record' ? Database : kind === 'code_snippet' ? Code2 : FileText;

  return (
    <div className="mt-2 rounded-lg bg-white/95 border border-black/10 overflow-hidden text-left">
      <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-[#008069] shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#111B21] truncate">{packet.title}</p>
            <p className="text-[11px] text-neutral-500 truncate">
              {packet.category}
              {packet.codeLanguage ? ` · ${packet.codeLanguage}` : ''}
              {packet.fileName ? ` · ${packet.fileName}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            title="Copy data"
            className="px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-200/70 rounded transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-[#008069]" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            title="Download packet"
            className="px-2 py-1 text-[11px] font-medium text-[#008069] hover:bg-[#008069]/10 rounded transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>Save</span>
          </button>
        </div>
      </div>

      {kind === 'data_record' ? (
        <div className="p-3 space-y-2 text-xs">
          {packet.fieldOneValue && (
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 pb-1.5 border-b border-neutral-100">
              <span className="text-neutral-500 font-medium">
                {packet.fieldOneLabel || 'Field 1'}
              </span>
              <span className="font-mono text-[#111B21] break-all">{packet.fieldOneValue}</span>
            </div>
          )}
          {packet.fieldTwoValue && (
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 pb-1.5 border-b border-neutral-100">
              <span className="text-neutral-500 font-medium">
                {packet.fieldTwoLabel || 'Field 2'}
              </span>
              <span className="font-mono text-[#111B21] break-all">{packet.fieldTwoValue}</span>
            </div>
          )}
          {packet.fieldThreeValue && (
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
              <span className="text-neutral-500 font-medium">
                {packet.fieldThreeLabel || 'Field 3'}
              </span>
              <span className="text-[#111B21] break-words">{packet.fieldThreeValue}</span>
            </div>
          )}
        </div>
      ) : (
        packet.payloadBody && (
          <pre className="p-3 text-[11px] leading-relaxed font-mono bg-[#111B21] text-emerald-100 overflow-x-auto max-h-52">
            <code>{packet.payloadBody}</code>
          </pre>
        )
      )}
    </div>
  );
}
