import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Wheel, Alpha, hsvaToRgba, rgbaToHsva, hsvaToHex, hsvaToHexa, hsvaToHsla } from '@uiw/react-color';
import { colord } from 'colord';
import { IconCheck, IconX, IconPalette } from '@tabler/icons-react';
import { Modal } from './ui/Modal';


export interface ColorPickerModalProps {
  initialColor: string;
  position: { top: number; left: number };
  onSave: (newColor: string) => void;
  onDiscard: () => void;
}

type ColorFormat = 'hex' | 'rgb' | 'hsl';

function detectFormat(colorStr: string): ColorFormat {
  const str = colorStr.trim().toLowerCase();
  if (str.startsWith('rgb')) return 'rgb';
  if (str.startsWith('hsl')) return 'hsl';
  return 'hex';
}

export const ColorPickerModal: React.FC<ColorPickerModalProps> = ({
  initialColor,
  position,
  onSave,
  onDiscard,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const detectedFormat = useMemo(() => detectFormat(initialColor), [initialColor]);
  const [outputFormat, setOutputFormat] = useState<ColorFormat>(detectedFormat);

  // Initialize HSVA state from initial color string
  const [hsva, setHsva] = useState(() => {
    const parsed = colord(initialColor);
    if (parsed.isValid()) {
      return rgbaToHsva(parsed.toRgb());
    }
    return { h: 0, s: 100, v: 100, a: 1 };
  });

  // Derived current RGBA and Hex values
  const currentRgba = useMemo(() => hsvaToRgba(hsva), [hsva]);
  const currentHsla = useMemo(() => hsvaToHsla(hsva), [hsva]);
  const currentHex = useMemo(() => {
    return hsva.a < 1 ? hsvaToHexa(hsva) : hsvaToHex(hsva);
  }, [hsva]);

  // Formatted output string based on active output format
  const formattedColorString = useMemo(() => {
    if (outputFormat === 'hex') {
      return currentHex;
    }
    if (outputFormat === 'rgb') {
      const { r, g, b, a } = currentRgba;
      return a < 1
        ? `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`
        : `rgb(${r}, ${g}, ${b})`;
    }
    if (outputFormat === 'hsl') {
      const { h, s, l, a } = currentHsla;
      return a < 1
        ? `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${Math.round(a * 100) / 100})`
        : `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
    }
    return currentHex;
  }, [outputFormat, currentHex, currentRgba, currentHsla]);

  // Individual value handlers
  const handleRgbChange = (channel: 'r' | 'g' | 'b' | 'a', value: number) => {
    const nextRgba = { ...currentRgba, [channel]: value };
    setHsva(rgbaToHsva(nextRgba));
  };

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    if (colord(val).isValid()) {
      const newRgba = colord(val).toRgb();
      setHsva(rgbaToHsva(newRgba));
    }
  };

  return (
    <Modal
      title="Color Selector"
      icon={<IconPalette className="w-4 h-4 text-blue-400" />}
      headerRight={
        <div className="flex items-center gap-1.5">
          {(['hex', 'rgb', 'hsl'] as ColorFormat[]).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => setOutputFormat(fmt)}
              className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded transition-colors ${
                outputFormat === fmt
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>
      }
      onClose={onDiscard}
      widthClass="w-[min(50vw,360px)] max-w-[50vw]"
      heightClass="h-auto max-h-[80vh]"
      className="prismpane-color-picker-modal"
      bodyClassName="p-3 gap-2 font-sans overflow-hidden"
    >
        {/* Color Swatch Comparison & Format String */}
        <div className="flex items-center justify-between bg-slate-950/60 p-2 rounded-lg border border-slate-800">
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-md shadow-inner border border-white/20"
              style={{ backgroundColor: initialColor }}
              title={`Original: ${initialColor}`}
            />
            <span className="text-slate-500 text-xs font-bold">→</span>
            <div
              className="w-5 h-5 rounded-md shadow-inner border border-white/20"
              style={{ backgroundColor: formattedColorString }}
              title={`New: ${formattedColorString}`}
            />
          </div>
          <span className="font-mono text-xs text-blue-300 select-all truncate max-w-[140px] ml-2">
            {formattedColorString}
          </span>
        </div>

        {/* Brightness Slider + Color Wheel */}
        <div className="flex items-center justify-between px-2 py-1 select-none">
          {/* Brightness Slider on the left */}
          <div className="flex flex-col items-center gap-1 pl-1">
            <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Bright</span>
            <input
              type="range"
              min="0"
              max="100"
              value={hsva.v}
              onChange={(e) => setHsva({ ...hsva, v: Number(e.target.value) })}
              className="w-2.5 h-32 rounded-lg appearance-none cursor-pointer border border-slate-700/60"
              style={{
                writingMode: 'vertical-lr',
                direction: 'rtl',
                background: `linear-gradient(to top, #000, ${hsvaToHex({ ...hsva, v: 100, a: 1 })})`,
              }}
              title={`Brightness: ${Math.round(hsva.v)}%`}
            />
          </div>

          {/* Color Wheel centered in remaining area */}
          <div className="flex-1 flex justify-center">
            <Wheel
              color={hsva}
              onChange={(color) => setHsva(color.hsva)}
              width={140}
              height={140}
            />
          </div>
        </div>

        {/* Alpha Slider */}
        <div className="flex flex-col gap-1 px-1">
          <div className="flex justify-between text-[10px] text-slate-400 font-medium">
            <span>Opacity</span>
            <span>{Math.round(hsva.a * 100)}%</span>
          </div>
          <Alpha
            hsva={hsva}
            onChange={(newAlpha) => setHsva({ ...hsva, ...newAlpha })}
            style={{ borderRadius: '6px', height: '10px' }}
          />
        </div>

        {/* RGB Value Edit Inputs (No Hex field) */}
        <div className="grid grid-cols-3 gap-2 pt-0.5">
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider text-center">R</label>
            <input
              type="number"
              min={0}
              max={255}
              value={currentRgba.r}
              onChange={(e) =>
                handleRgbChange('r', Math.min(255, Math.max(0, parseInt(e.target.value) || 0)))
              }
              className="bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none rounded px-1 py-1 text-xs font-mono text-slate-100 text-center"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider text-center">G</label>
            <input
              type="number"
              min={0}
              max={255}
              value={currentRgba.g}
              onChange={(e) =>
                handleRgbChange('g', Math.min(255, Math.max(0, parseInt(e.target.value) || 0)))
              }
              className="bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none rounded px-1 py-1 text-xs font-mono text-slate-100 text-center"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider text-center">B</label>
            <input
              type="number"
              min={0}
              max={255}
              value={currentRgba.b}
              onChange={(e) =>
                handleRgbChange('b', Math.min(255, Math.max(0, parseInt(e.target.value) || 0)))
              }
              className="bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none rounded px-1 py-1 text-xs font-mono text-slate-100 text-center"
            />
          </div>
        </div>

        {/* Action Buttons: Save & Discard */}
        <div className="flex items-center gap-2 border-t border-slate-800 pt-2 mt-0.5">
          <button
            type="button"
            onClick={onDiscard}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <IconX className="w-3.5 h-3.5" />
            <span>Discard</span>
          </button>

          <button
            type="button"
            onClick={() => onSave(formattedColorString)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-medium shadow-md shadow-blue-900/30 transition-colors cursor-pointer"
          >
            <IconCheck className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>
        </div>
    </Modal>
  );
};
