import type { ResolutionPreset } from './types';

interface PreviewResolutionPickerProps {
  selectedResolutionName: string;
  presets: ResolutionPreset[];
  onSelect: (preset: ResolutionPreset) => void;
}

export function PreviewResolutionPicker({
  selectedResolutionName,
  presets,
  onSelect,
}: PreviewResolutionPickerProps) {
  return (
    <select
      className="preview-resolution-select"
      value={selectedResolutionName}
      onChange={(e) => {
        const preset = presets.find((item) => item.name === e.target.value);
        if (preset) {
          onSelect(preset);
        }
      }}
      title="Resolution Simulation"
    >
      {presets.map((preset) => (
        <option key={preset.name} value={preset.name}>
          {preset.name}{preset.width > 0 ? ` (${preset.width}×${preset.height})` : ''}
        </option>
      ))}
    </select>
  );
}
