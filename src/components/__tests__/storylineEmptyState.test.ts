import { describe, expect, it } from 'vitest';
import { getSceneEmptyStateVariant, shouldSelectSceneFromClickTarget } from '../Storyline';

describe('getSceneEmptyStateVariant', () => {
  it('uses a primary hint only for the first empty scene when all scenes are empty', () => {
    expect(getSceneEmptyStateVariant(0, 0, true)).toBe('primary');
    expect(getSceneEmptyStateVariant(0, 1, true)).toBe('secondary');
    expect(getSceneEmptyStateVariant(0, 2, true)).toBe('secondary');
  });

  it('uses a compact hint for empty scenes after the first cut exists elsewhere', () => {
    expect(getSceneEmptyStateVariant(0, 0, false)).toBe('secondary');
    expect(getSceneEmptyStateVariant(0, 3, false)).toBe('secondary');
  });

  it('does not show an empty-state hint when the scene already has cuts', () => {
    expect(getSceneEmptyStateVariant(1, 0, false)).toBeNull();
    expect(getSceneEmptyStateVariant(4, 2, true)).toBeNull();
  });
});

describe('shouldSelectSceneFromClickTarget', () => {
  it('allows scene surface clicks to select the scene', () => {
    const sceneColumn = document.createElement('div');
    sceneColumn.className = 'scene-column';

    const sceneCuts = document.createElement('div');
    sceneCuts.className = 'scene-cuts';
    sceneColumn.appendChild(sceneCuts);

    expect(shouldSelectSceneFromClickTarget(sceneColumn)).toBe(true);
    expect(shouldSelectSceneFromClickTarget(sceneCuts)).toBe(true);
  });

  it('blocks selection when the click started from cut or group UI', () => {
    const cutCard = document.createElement('div');
    cutCard.className = 'cut-card';

    const expandedGroup = document.createElement('div');
    expandedGroup.className = 'expanded-group-container';

    const expandedGroupTitle = document.createElement('span');
    expandedGroup.appendChild(expandedGroupTitle);

    expect(shouldSelectSceneFromClickTarget(cutCard)).toBe(false);
    expect(shouldSelectSceneFromClickTarget(expandedGroupTitle)).toBe(false);
  });

  it('blocks selection for scene menu and form controls', () => {
    const menu = document.createElement('div');
    menu.className = 'scene-menu';

    const menuButton = document.createElement('button');
    menuButton.className = 'scene-menu-btn';

    const nameInput = document.createElement('input');
    nameInput.className = 'scene-name-input';

    expect(shouldSelectSceneFromClickTarget(menu)).toBe(false);
    expect(shouldSelectSceneFromClickTarget(menuButton)).toBe(false);
    expect(shouldSelectSceneFromClickTarget(nameInput)).toBe(false);
  });
});
