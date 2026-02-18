# UI Components

**目的**: UIプリミティブとフィードバック系コンポーネントの参照。
**適用範囲**: `src/ui/*`。
**関連ファイル**: `src/ui/primitives/`, `src/ui/patterns/`, `src/ui/feedback/`。
**更新頻度**: 中。

## Must / Must Not
- Must: 本ドキュメントは `src/ui` のプリミティブ/パターン/フィードバック層のみを扱う。
- Must: 利用例と公開 API の同期を保つ。
- Must Not: ドメインUI仕様（Storyline/SceneDurationBar など）をここへ混在させない。
- Must Not: 色仕様をこのファイルで定義しない（色は color-system を参照）。

ドメインUIは `docs/guides/scene-duration-bar.md` を参照。

## Structure

```
src/ui/
├── primitives/        # Basic building blocks
│   ├── Modal.tsx      # Overlay, Container, Header, Body, Footer, Actions, ActionButton
│   ├── Tooltip.tsx    # Hover/focus tooltip for explanations
│   ├── Slider.tsx     # Horizontal range slider with keyboard support
│   ├── Input.tsx      # Text input
│   ├── InputGroup.tsx # Input with unit suffix
│   ├── Select.tsx     # Select dropdown
│   ├── RadioGroup.tsx # Radio option group
│   ├── Checkbox.tsx   # Checkbox control
│   ├── ReadOnlyValue.tsx # Display-only value
│   ├── PathField.tsx  # Path display with change button
│   ├── Toggle.tsx     # Toggle / switch
│   ├── Tabs.tsx       # Tabs
│   ├── SettingsSection.tsx # Grouped settings section
│   ├── SettingsRow.tsx # Label + description + control row
│   ├── StatDisplay.tsx # Stats display
│   └── menu/          # Context menu primitives
│       ├── Menu.tsx           # Menu, MenuHeader, MenuItem, MenuSeparator, MenuCheckboxItem
│       ├── ContextMenu.tsx    # ContextMenu (Portal-based positioning)
│       ├── MenuSubmenu.tsx    # MenuSubmenu (nested menus)
│       ├── Menu.module.css
│       └── index.ts
│   └── *.module.css
├── patterns/          # Combined components for consistent UX
│   ├── Field.tsx      # Label + hint + error wrapper
│   ├── DisabledReason.tsx # Balloon for disabled state reasons
│   ├── InlineSlider.tsx # Compact slider in popover (volume, opacity)
│   └── *.module.css
├── feedback/          # Notification/dialog components
│   ├── Toast.tsx      # ToastProvider, useToast
│   ├── MiniToast.tsx  # useMiniToast (compact overlay toast)
│   ├── Dialog.tsx     # DialogProvider, useDialog (confirm/alert)
│   ├── Banner.tsx     # BannerProvider, useBanner (persistent notifications)
│   └── *.module.css
└── index.ts           # Main export
```

## Usage

### Setup (in main.tsx)

```tsx
import { ToastProvider, DialogProvider, BannerProvider } from './ui';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <DialogProvider>
      <BannerProvider>
        <App />
      </BannerProvider>
    </DialogProvider>
  </ToastProvider>
);
```

### Toast

```tsx
import { useToast } from './ui';

function MyComponent() {
  const { toast } = useToast();

  const handleSave = () => {
    toast.success('Saved!');
  };

  const handleError = () => {
    toast.error('Failed to save', 'Check your connection');
  };

  // Persistent toast (duration: 0)
  const handleProcessing = () => {
    const id = toast.info('Processing...', undefined, { duration: 0 });
    // Later: toast.dismiss(id);
  };

  // Toast with action button (CTA)
  const handleAutosaveError = () => {
    toast.error('Autosave failed', 'Please save manually.', {
      id: 'autosave-failed',
      duration: 0,
      action: {
        label: 'Save Now',
        onClick: () => saveProject(),
      },
    });
  };
}
```

### Confirm/Alert Dialog

```tsx
import { useDialog } from './ui';

function MyComponent() {
  const { alert, confirm } = useDialog();

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete Clip',
      message: 'This action cannot be undone.',
      targetName: 'clip_001.mp4',
      variant: 'danger',
    });

    if (confirmed) {
      // Proceed with delete
    }
  };

  const handleError = async () => {
    await alert({
      title: 'Error',
      message: 'Something went wrong',
      variant: 'danger',
    });
  };
}
```

### Modal Primitives

```tsx
import {
  Overlay,
  Container,
  Header,
  Body,
  Footer,
  Actions,
  ActionButton,
  useModalKeyboard,
} from './ui';

function CustomModal({ open, onClose }) {
  useModalKeyboard({ onEscape: onClose, enabled: open });

  if (!open) return null;

  return (
    <Overlay onClick={onClose}>
      <Container size="md">
        <Header title="Custom Modal" onClose={onClose} />
        <Body>
          <p>Modal content here</p>
        </Body>
        <Footer>
          <Actions>
            <ActionButton variant="secondary" onClick={onClose}>
              Cancel
            </ActionButton>
            <ActionButton variant="primary" onClick={handleConfirm}>
              Confirm
            </ActionButton>
          </Actions>
        </Footer>
      </Container>
    </Overlay>
  );
}
```

## Toast Variants

| Variant   | Duration | Use Case |
|-----------|----------|----------|
| success   | 4s       | Operation completed |
| info      | 4s       | Information |
| warning   | 6s       | Warning message |
| error     | 6s       | Error occurred |

### Toast Options

| Option    | Type         | Description |
|-----------|--------------|-------------|
| duration  | number       | Duration in ms. 0 = persistent (manual dismiss) |
| id        | string       | Unique ID for deduplication |
| action    | ToastAction  | Action button (CTA) |

### Toast Action

For toasts that need user action (e.g., autosave failure, retry prompts):

```tsx
toast.error('Autosave failed', 'Changes may be lost.', {
  id: 'autosave-failed',
  duration: 0,  // Persistent until dismissed
  action: {
    label: 'Save Now',
    onClick: () => handleManualSave(),
  },
});
```

## MiniToast

Compact, auto-dismissing notification for overlay contexts (e.g. PreviewModal).
No provider required — renders inline where placed.

```tsx
import { useMiniToast } from './ui';

function PreviewOverlay() {
  const miniToast = useMiniToast();

  const handleCapture = () => {
    miniToast.show('Frame captured', 'success');
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* media content */}
      {miniToast.element}
    </div>
  );
}
```

| Variant   | Duration | Use Case |
|-----------|----------|----------|
| success   | 1.8s     | Capture / save confirmation |
| info      | 1.8s     | State change (IN/OUT set) |
| warning   | 1.8s     | Non-blocking warning |
| error     | 1.8s     | Operation failed |

Duration can be overridden per-call: `miniToast.show('msg', 'info', 3000)`.
Default can be set via hook options: `useMiniToast({ duration: 2500 })`.

## Dialog Variants

| Variant   | Icon | Use Case |
|-----------|------|----------|
| default   | AlertCircle | General confirmation |
| info      | Info | Information dialog |
| warning   | AlertTriangle | Warning confirmation |
| danger    | AlertTriangle (red) | Destructive action |

### Danger Dialogs

For danger dialogs:
- Cancel button is visually emphasized
- Target name is displayed if provided
- Use for irreversible actions like delete

## Banner

For persistent/ongoing state notifications (network status, sync progress):

```tsx
import { useBanner } from './ui';

function MyComponent() {
  const { banner } = useBanner();

  // Show persistent warning
  banner.show({
    id: 'offline',
    variant: 'warning',
    message: 'You are offline. Changes will sync when reconnected.',
    icon: 'wifi-off',
    dismissible: true,
  });

  // Show progress
  const id = banner.show({
    variant: 'progress',
    message: 'Exporting video...',
    progress: 0,
  });
  // Update progress
  banner.update(id, { progress: 50, message: 'Exporting video... 50%' });
  // Dismiss when done
  banner.dismiss(id);
}
```

| Variant   | Use Case |
|-----------|----------|
| info      | Information banner |
| warning   | Ongoing warning (offline, unsaved) |
| error     | Persistent error state |
| progress  | Long-running operation |

## Tooltip

For hover/focus explanations (NOT for disabled reasons):

```tsx
import { Tooltip } from './ui';

<Tooltip content="Export all scenes as video" position="bottom">
  <button>Export</button>
</Tooltip>
```

| Position | Description |
|----------|-------------|
| top      | Above trigger (default) |
| bottom   | Below trigger |
| left     | Left of trigger |
| right    | Right of trigger |

## Field

For form inputs with label, hint, and error support:

```tsx
import { Field, Input } from './ui';

<Field label="Project Name" hint="Used as export filename" error={errors.name}>
  <Input value={name} onChange={...} />
</Field>

// Inline layout
<Field label="FPS" inline>
  <Input type="number" value={fps} />
</Field>
```

## SettingsRow

For settings-style rows with label, description, and control:

```tsx
import { SettingsRow, Select } from './ui';

<SettingsRow label="Theme" description="Application color scheme">
  <Select value={theme} options={THEME_OPTIONS} onChange={setTheme} />
</SettingsRow>
```

## DisabledReason

For explaining why an action is disabled (wraps element to capture hover):

```tsx
import { DisabledReason } from './ui';

<DisabledReason reason="Select a clip first" disabled={!hasSelection}>
  <button disabled={!hasSelection}>Export</button>
</DisabledReason>
```

Use for important actions (Export, Delete) where users need to understand why disabled.

## Slider

Horizontal range slider with keyboard navigation:

```tsx
import { Slider } from './ui';

// Basic slider
<Slider value={volume} min={0} max={100} onChange={setVolume} />

// With value display
<Slider
  value={opacity}
  min={0}
  max={1}
  step={0.1}
  onChange={setOpacity}
  showValue
  formatValue={(v) => `${Math.round(v * 100)}%`}
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| value | number | - | Current value |
| min | number | 0 | Minimum value |
| max | number | 100 | Maximum value |
| step | number | 1 | Step increment |
| disabled | boolean | false | Disabled state |
| showValue | boolean | false | Show value label |
| formatValue | (v) => string | - | Custom value formatter |

Keyboard: Arrow keys (±step), PageUp/Down (±10×step), Home/End (min/max)

## InlineSlider

Compact slider in popover (for toolbars, panels):

```tsx
import { InlineSlider } from './ui';
import { Volume2 } from 'lucide-react';

// With icon trigger
<InlineSlider
  value={volume}
  onChange={setVolume}
  icon={<Volume2 size={16} />}
/>

// With label trigger
<InlineSlider
  value={opacity}
  min={0}
  max={1}
  step={0.1}
  onChange={setOpacity}
  label="Opacity"
  formatValue={(v) => `${Math.round(v * 100)}%`}
  position="bottom"
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| icon | ReactNode | - | Icon as trigger |
| label | string | - | Label as trigger |
| position | 'top' \| 'bottom' \| 'left' \| 'right' | 'top' | Popover position |
| popoverWidth | number | 140 | Popover width in px |

## Context Menu Primitives

### Basic Context Menu

```tsx
import {
  ContextMenu,
  MenuHeader,
  MenuItem,
  MenuSeparator,
  MenuSubmenu,
} from './ui';
import { Copy, Trash2, ArrowRightLeft } from 'lucide-react';

function MyComponent() {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div onContextMenu={handleContextMenu}>
        Right click me
      </div>

      {menu && (
        <ContextMenu position={menu} onClose={() => setMenu(null)}>
          <MenuHeader>Options</MenuHeader>
          <MenuItem icon={<Copy size={14} />} onClick={handleCopy}>
            Copy
          </MenuItem>
          <MenuItem disabled={!canPaste}>Paste</MenuItem>
          <MenuSeparator />
          <MenuSubmenu label="Move to" icon={<ArrowRightLeft size={14} />}>
            <MenuItem onClick={() => handleMove('scene1')}>Scene 1</MenuItem>
            <MenuItem onClick={() => handleMove('scene2')}>Scene 2</MenuItem>
          </MenuSubmenu>
          <MenuSeparator />
          <MenuItem icon={<Trash2 size={14} />} variant="danger" onClick={handleDelete}>
            Delete
          </MenuItem>
        </ContextMenu>
      )}
    </>
  );
}
```

### MenuItem Variants

| Variant   | Color | Use Case |
|-----------|-------|----------|
| default   | text-primary | Normal actions |
| danger    | accent-danger | Destructive actions |
| action    | accent-purple | Clip operations, special actions |
| success   | accent-success | Positive actions |

### SceneDeck Context Menus (Domain UI)

`CutContextMenu` / `AssetContextMenu` are domain-specific and live in `src/components/context-menus/`.
They are not exported from `src/ui` to keep primitives/patterns free of domain logic.

### Keyboard Navigation

Menu primitives support keyboard navigation:
- `↑` / `↓`: Navigate items
- `Enter` / `Space`: Select item
- `Escape`: Close menu
- `→` / `←`: Open/close submenus

## Notification Guidelines

| Situation | Component |
|-----------|-----------|
| Success | Toast (short) |
| Failure | Toast (long) + action |
| Overlay feedback (preview) | MiniToast (compact, auto-dismiss) |
| Ongoing state | Banner |
| Destructive action | Confirm modal (danger) |
| Form validation | Inline error (Field) |
| Disabled reason | DisabledReason (balloon) |
| Explanation | Tooltip |

## Related Docs
- `docs/guides/implementation/color-system.md`
