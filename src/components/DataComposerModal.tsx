import React, { useState } from 'react';
import { Code2, Database, FileText, Send, Upload, X } from 'lucide-react';
import { DataPacket, MessageKind, VALIDATION_RULES } from '../types/chat';

interface DataComposerModalProps {
  partnerName: string;
  onClose: () => void;
  onSendPacket: (params: {
    kind: MessageKind;
    text: string;
    dataPacket: DataPacket;
  }) => Promise<void>;
}

export function DataComposerModal({
  partnerName,
  onClose,
  onSendPacket,
}: DataComposerModalProps) {
  const [mode, setMode] = useState<'data_record' | 'code_snippet' | 'file_packet'>('data_record');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Transfer');
  const [caption, setCaption] = useState('');

  // Structured Record fields
  const [fieldOneLabel, setFieldOneLabel] = useState('Reference ID');
  const [fieldOneValue, setFieldOneValue] = useState('');
  const [fieldTwoLabel, setFieldTwoLabel] = useState('Account / Value');
  const [fieldTwoValue, setFieldTwoValue] = useState('');
  const [fieldThreeLabel, setFieldThreeLabel] = useState('Notes');
  const [fieldThreeValue, setFieldThreeValue] = useState('');

  // Code / Payload fields
  const [codeLanguage, setCodeLanguage] = useState('JSON');
  const [payloadBody, setPayloadBody] = useState('');

  // File Packet fields
  const [fileName, setFileName] = useState('');
  const [fileMimeType, setFileMimeType] = useState('text/plain');
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 64 * 1024) {
      setFileError('Select a text, CSV, JSON, or code file under 64 KB.');
      return;
    }

    try {
      const content = await file.text();
      const truncated = content.slice(0, VALIDATION_RULES.PACKET_PAYLOAD_MAX);
      setFileName(file.name.slice(0, VALIDATION_RULES.PACKET_FILENAME_MAX));
      setFileMimeType((file.type || 'text/plain').slice(0, VALIDATION_RULES.PACKET_MIMETYPE_MAX));
      setPayloadBody(truncated);
      if (!title.trim()) {
        setTitle(file.name.slice(0, VALIDATION_RULES.PACKET_TITLE_MAX));
      }
      if (content.length > VALIDATION_RULES.PACKET_PAYLOAD_MAX) {
        setFileError(
          `File content trimmed to ${VALIDATION_RULES.PACKET_PAYLOAD_MAX} characters to fit real-time packet limit.`
        );
      }
    } catch {
      setFileError('Unable to read this file as UTF-8 text.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    let cleanTitle = title.trim().slice(0, VALIDATION_RULES.PACKET_TITLE_MAX);
    if (!cleanTitle) {
      if (mode === 'data_record') {
        cleanTitle = fieldOneValue.trim() ? `Record: ${fieldOneValue.trim().slice(0, 30)}` : 'Structured Data';
      } else if (mode === 'code_snippet') {
        cleanTitle = `${codeLanguage} Snippet`;
      } else {
        cleanTitle = fileName || 'Shared Document';
      }
    }

    if (mode === 'code_snippet' && !payloadBody.trim()) {
      setFormError('Please enter code or JSON payload content.');
      return;
    }

    setSending(true);
    try {
      let packet: DataPacket = {
        title: cleanTitle,
        category: category.trim().slice(0, VALIDATION_RULES.PACKET_CATEGORY_MAX) || 'Data',
      };

      if (mode === 'data_record') {
        packet = {
          ...packet,
          ...(fieldOneValue.trim()
            ? {
                fieldOneLabel: (fieldOneLabel.trim() || 'Field 1').slice(0, VALIDATION_RULES.PACKET_LABEL_MAX),
                fieldOneValue: fieldOneValue.trim().slice(0, VALIDATION_RULES.PACKET_VALUE_MAX),
              }
            : {}),
          ...(fieldTwoValue.trim()
            ? {
                fieldTwoLabel: (fieldTwoLabel.trim() || 'Field 2').slice(0, VALIDATION_RULES.PACKET_LABEL_MAX),
                fieldTwoValue: fieldTwoValue.trim().slice(0, VALIDATION_RULES.PACKET_VALUE_MAX),
              }
            : {}),
          ...(fieldThreeValue.trim()
            ? {
                fieldThreeLabel: (fieldThreeLabel.trim() || 'Field 3').slice(0, VALIDATION_RULES.PACKET_LABEL_MAX),
                fieldThreeValue: fieldThreeValue.trim().slice(0, VALIDATION_RULES.PACKET_VALUE_MAX),
              }
            : {}),
        };
      } else if (mode === 'code_snippet') {
        packet = {
          ...packet,
          codeLanguage: codeLanguage.trim().slice(0, VALIDATION_RULES.PACKET_CODE_LANG_MAX) || 'JSON',
          payloadBody: payloadBody.slice(0, VALIDATION_RULES.PACKET_PAYLOAD_MAX),
        };
      } else {
        packet = {
          ...packet,
          fileName: (fileName.trim() || 'data-packet.txt').slice(
            0,
            VALIDATION_RULES.PACKET_FILENAME_MAX
          ),
          fileMimeType: (fileMimeType || 'text/plain').slice(
            0,
            VALIDATION_RULES.PACKET_MIMETYPE_MAX
          ),
          ...(payloadBody ? { payloadBody: payloadBody.slice(0, VALIDATION_RULES.PACKET_PAYLOAD_MAX) } : {}),
        };
      }

      const summaryText =
        caption.trim() ||
        (mode === 'data_record'
          ? `Shared structured record: ${cleanTitle}`
          : mode === 'code_snippet'
            ? `Shared ${codeLanguage} payload: ${cleanTitle}`
            : `Shared file packet: ${fileName || cleanTitle}`);

      await onSendPacket({
        kind: mode,
        text: summaryText,
        dataPacket: packet,
      });
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to send data packet. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
      <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#111B21]">Send Data Packet</h2>
            <p className="text-xs text-neutral-500">
              Send structured records, payloads, or downloadable files to {partnerName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-neutral-500 hover:text-neutral-900 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <span className="font-semibold">Error:</span>
              <span>{formError}</span>
            </div>
          )}

          {/* Interactive Segmented Mode Selector */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-[#F0F2F5] rounded-lg">
            <button
              type="button"
              onClick={() => setMode('data_record')}
              className={`py-2 px-3 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'data_record'
                  ? 'bg-white text-[#111B21] shadow-xs'
                  : 'text-neutral-600 hover:text-[#111B21]'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Record</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('code_snippet')}
              className={`py-2 px-3 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'code_snippet'
                  ? 'bg-white text-[#111B21] shadow-xs'
                  : 'text-neutral-600 hover:text-[#111B21]'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>JSON / Code</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('file_packet')}
              className={`py-2 px-3 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'file_packet'
                  ? 'bg-white text-[#111B21] shadow-xs'
                  : 'text-neutral-600 hover:text-[#111B21]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Data File</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Packet Title
              </label>
              <input
                type="text"
                required
                maxLength={VALIDATION_RULES.PACKET_TITLE_MAX}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  mode === 'data_record'
                    ? 'e.g. Invoice #4082 Settlement Details'
                    : mode === 'code_snippet'
                      ? 'e.g. API Webhook Payload'
                      : 'e.g. October Inventory Export'
                }
                className="w-full px-3.5 py-2 text-sm bg-[#F8FAF9] border border-neutral-300 rounded-lg focus:outline-none focus:border-[#008069]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#F8FAF9] border border-neutral-300 rounded-lg focus:outline-none focus:border-[#008069]"
              >
                <option value="Transfer">Transfer</option>
                <option value="Credentials">Credentials</option>
                <option value="Contact">Contact</option>
                <option value="Specification">Specification</option>
                <option value="Dataset">Dataset</option>
              </select>
            </div>
          </div>

          {mode === 'data_record' && (
            <div className="space-y-3 bg-[#F8FAF9] border border-neutral-200 rounded-lg p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  maxLength={60}
                  value={fieldOneLabel}
                  onChange={(e) => setFieldOneLabel(e.target.value)}
                  placeholder="Field 1 Label"
                  className="px-3 py-2 text-xs font-medium bg-white border border-neutral-300 rounded-md focus:outline-none focus:border-[#008069]"
                />
                <input
                  type="text"
                  maxLength={500}
                  required
                  value={fieldOneValue}
                  onChange={(e) => setFieldOneValue(e.target.value)}
                  placeholder="Field 1 Value"
                  className="sm:col-span-2 px-3 py-2 text-xs bg-white border border-neutral-300 rounded-md focus:outline-none focus:border-[#008069]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  maxLength={60}
                  value={fieldTwoLabel}
                  onChange={(e) => setFieldTwoLabel(e.target.value)}
                  placeholder="Field 2 Label"
                  className="px-3 py-2 text-xs font-medium bg-white border border-neutral-300 rounded-md focus:outline-none focus:border-[#008069]"
                />
                <input
                  type="text"
                  maxLength={500}
                  value={fieldTwoValue}
                  onChange={(e) => setFieldTwoValue(e.target.value)}
                  placeholder="Field 2 Value (optional)"
                  className="sm:col-span-2 px-3 py-2 text-xs bg-white border border-neutral-300 rounded-md focus:outline-none focus:border-[#008069]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  maxLength={60}
                  value={fieldThreeLabel}
                  onChange={(e) => setFieldThreeLabel(e.target.value)}
                  placeholder="Field 3 Label"
                  className="px-3 py-2 text-xs font-medium bg-white border border-neutral-300 rounded-md focus:outline-none focus:border-[#008069]"
                />
                <input
                  type="text"
                  maxLength={500}
                  value={fieldThreeValue}
                  onChange={(e) => setFieldThreeValue(e.target.value)}
                  placeholder="Field 3 Value (optional)"
                  className="sm:col-span-2 px-3 py-2 text-xs bg-white border border-neutral-300 rounded-md focus:outline-none focus:border-[#008069]"
                />
              </div>
            </div>
          )}

          {mode === 'code_snippet' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-neutral-700">Payload Format</label>
                <select
                  value={codeLanguage}
                  onChange={(e) => setCodeLanguage(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-[#F8FAF9] border border-neutral-300 rounded-md focus:outline-none focus:border-[#008069]"
                >
                  <option value="JSON">JSON</option>
                  <option value="CSV">CSV</option>
                  <option value="TypeScript">TypeScript</option>
                  <option value="Python">Python</option>
                  <option value="SQL">SQL</option>
                  <option value="Text">Plain Text</option>
                </select>
              </div>
              <textarea
                rows={6}
                required
                maxLength={VALIDATION_RULES.PACKET_PAYLOAD_MAX}
                value={payloadBody}
                onChange={(e) => setPayloadBody(e.target.value)}
                placeholder={'{\n  "orderId": "ORD-9910",\n  "status": "confirmed"\n}'}
                className="w-full p-3 text-xs font-mono bg-[#111B21] text-emerald-100 rounded-lg border border-neutral-700 focus:outline-none focus:border-[#00A884]"
              />
              <p className="text-[11px] text-neutral-500 text-right tabular-nums">
                {payloadBody.length} / {VALIDATION_RULES.PACKET_PAYLOAD_MAX} chars
              </p>
            </div>
          )}

          {mode === 'file_packet' && (
            <div className="space-y-3">
              <label className="flex flex-col items-center justify-center p-5 border border-dashed border-neutral-300 rounded-lg bg-[#F8FAF9] hover:bg-[#F0F4F2] transition-colors cursor-pointer">
                <Upload className="w-5 h-5 text-[#008069] mb-1.5" />
                <span className="text-xs font-semibold text-[#111B21]">
                  {fileName ? `Loaded: ${fileName}` : 'Choose a .json, .csv, .txt, .md, or .sql file'}
                </span>
                <span className="text-[11px] text-neutral-500 mt-0.5">
                  Recipient can view and download the exact file in one click
                </span>
                <input
                  type="file"
                  accept=".txt,.csv,.json,.md,.xml,.sql,.ts,.js,.py,.yaml,.yml,.log"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {fileError && <p className="text-xs text-amber-700">{fileError}</p>}

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  File Contents (editable before sending)
                </label>
                <textarea
                  rows={5}
                  required
                  maxLength={VALIDATION_RULES.PACKET_PAYLOAD_MAX}
                  value={payloadBody}
                  onChange={(e) => setPayloadBody(e.target.value)}
                  placeholder="Select a file above or paste CSV / JSON / text data here..."
                  className="w-full p-3 text-xs font-mono bg-[#F8FAF9] border border-neutral-300 rounded-lg focus:outline-none focus:border-[#008069]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Message Note (optional)
            </label>
            <input
              type="text"
              maxLength={300}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add context for the recipient..."
              className="w-full px-3.5 py-2 text-sm bg-[#F8FAF9] border border-neutral-300 rounded-lg focus:outline-none focus:border-[#008069]"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !title.trim()}
              className="px-4 py-2 bg-[#008069] hover:bg-[#006D59] text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Sending Packet...' : 'Send Data Packet'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
