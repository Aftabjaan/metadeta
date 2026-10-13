import React from 'react';
import { TitleSettings, KeywordSettings, BackgroundSettings, AssetType } from '../types';
import { AdvancedMetadataSettingsModal } from './AdvancedMetadataSettingsModal';

interface TitleSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  titleSettings: TitleSettings;
  keywordSettings?: KeywordSettings;
  backgroundSettings?: BackgroundSettings;
  assetType?: AssetType;
  onSave: (settings: TitleSettings) => void;
  onSaveKeywordSettings?: (settings: KeywordSettings) => void;
  onSaveBackgroundSettings?: (settings: BackgroundSettings) => void;
  onSaveAll?: (ts: TitleSettings, ks: KeywordSettings, bs: BackgroundSettings, at: AssetType) => void;
  onSelectAssetType?: (type: AssetType) => void;
}

export const TitleSettingsModal: React.FC<TitleSettingsModalProps> = ({
  isOpen,
  onClose,
  titleSettings,
  keywordSettings = { targetCount: 30 },
  backgroundSettings = { userBackgroundType: 'auto' },
  assetType = 'photo',
  onSave,
  onSaveKeywordSettings = () => {},
  onSaveBackgroundSettings = () => {},
  onSaveAll,
  onSelectAssetType = () => {},
}) => {
  return (
    <AdvancedMetadataSettingsModal
      isOpen={isOpen}
      onClose={onClose}
      titleSettings={titleSettings}
      keywordSettings={keywordSettings}
      backgroundSettings={backgroundSettings}
      assetType={assetType}
      onSaveTitleSettings={onSave}
      onSaveKeywordSettings={onSaveKeywordSettings}
      onSaveBackgroundSettings={onSaveBackgroundSettings}
      onSaveAll={onSaveAll}
      onSelectAssetType={onSelectAssetType}
      initialActiveSection="title"
    />
  );
};
