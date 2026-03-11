# Color System

**目的**: UI配色の意味づけと利用ルールを固定する。
**適用範囲**: `src/styles/globals.css`, UI CSS Modules。
**関連ファイル**: `src/styles/globals.css`, `src/components/*.css`。
**更新頻度**: 低。

## Must / Must Not
- Must: 色トークンの意味づけはこのドキュメントを正本とする。
- Must: semantic token と RGB token をセットで維持する。
- Must Not: コンポーネント個別で新しい意味色を無秩序に追加しない。
- Must Not: 既存 token の用途を docs 更新なしで変更しない。

## Usage Rules

### Surface / Text / Border
- 背景は slate 系の dark surface を維持し、`--bg-primary` / `--bg-secondary` / `--bg-tertiary` を面の深さで使い分ける。
- full-viewport や Header など深い面は `--bg-depth-1` / `--bg-depth-2` / `--bg-depth-3` の gradient を使う。
- 文字色は `--text-primary` / `--text-secondary` / `--text-muted` を役割で固定し、装飾色の代用にしない。
- 境界線は `--border-color` を基準にし、hover/active は `--border-light`、弱い境界は `--border-muted` を使う。

### Selection / Media / Action
- 単一選択は `--accent-primary` (`#00b4d8`)、複数選択と group は `--accent-group` (`#14b8a6`) を使う。
- Video 系は `--accent-video` (`#6366f1`)、Audio 系は `--accent-audio` (`#a855f7`) を使い、media type の意味を他用途へ流用しない。
- 成功操作は `--accent-success` (`#10b981`)、警告は `--accent-warning` (`#f59e0b`)、削除や破壊操作は `--accent-danger` (`#ef4444`) を使う。
- Lip Sync 系の強調は `--accent-pink` (`#ec4899`) から `--accent-purple` (`#8b5cf6`) への gradient を使う。

### Scene / Timeline / Primary Actions
- `SceneDurationBar` と Storyline の scene segment は `--timeline-scene-1` から `--timeline-scene-5` を循環利用し、scene 固有色を個別定義しない。
- Primary action の強調は `--accent-primary` から `--accent-primary-deep` (`#0096c7`) の gradient を基準にする。
- Selection から action emphasis へ移る導線では `--accent-primary` -> `--accent-secondary` を基本遷移にする。

### Transparency
- 透過表現は HEX 直書きではなく `*-rgb` 変数を使う。
- 背景 tint は `0.05` から `0.1`、border は `0.2` から `0.3`、focus ring は `rgba(var(--accent-primary-rgb), 0.35)` を基準にする。
- badge や glow のような濃い面でも、意味色そのものは semantic token から取る。

## Transparency Guidelines

When using colors with transparency, use the RGB variables:

```css
/* Background with 10% opacity */
background-color: rgba(var(--accent-group-rgb), 0.1);

/* Border with 20% opacity */
border: 1px solid rgba(var(--accent-video-rgb), 0.2);

/* Box shadow with 30% opacity */
box-shadow: 0 0 0 2px rgba(var(--accent-audio-rgb), 0.3);
```

### Common Opacity Values

| Usage | Opacity |
|-------|---------|
| Background tint | 0.05 - 0.1 |
| Border | 0.2 - 0.3 |
| Box shadow | 0.3 |
| Badge background | 0.9 |
| Hover state | 1.0 |

## Change Rules
- literal value の正本は `src/styles/globals.css` とし、この docs は「どの意味で使うか」を決める。
- 新しい semantic token を追加する場合は、用途、既存 token で代替できない理由、必要なら `*-rgb` 追加を同時に定義する。
- 既存 token の意味変更は、この docs と関連 UI の両方を同時に更新する。
