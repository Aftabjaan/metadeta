import React from 'react';
import { TitleSettings, KeywordSettings, BackgroundSettings, AssetType } from '../types';
import { AdvancedMetadataSettingsModal } from './AdvancedMetadataSettingsModal';

interface KeywordSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  keywordSettings: KeywordSettings;
  titleSettings?: TitleSettings;
  backgroundSettings?: BackgroundSettings;
  assetType?: AssetType;
  onSave: (settings: KeywordSettings) => void;
  onSaveTitleSettings?: (settings: TitleSettings) => void;
  onSaveBackgroundSettings?: (settings: BackgroundSettings) => void;
  onSaveAll?: (ts: TitleSettings, ks: KeywordSettings, bs: BackgroundSettings, at: AssetType) => void;
  onSelectAssetType?: (type: AssetType) => void;
}

export const KeywordSettingsModal: React.FC<KeywordSettingsModalProps> = ({
  isOpen,
  onClose,
  keywordSettings,
  titleSettings = { maxLength: 70, lengthMode: 'standard', style: 'SEO Optimized', backgroundSuffix: 'none' },
  backgroundSettings = { userBackgroundType: 'auto' },
  assetType = 'photo',
  onSave,
  onSaveTitleSettings = () => {},
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
      onSaveTitleSettings={onSaveTitleSettings}
      onSaveKeywordSettings={onSave}
      onSaveBackgroundSettings={onSaveBackgroundSettings}
      onSaveAll={onSaveAll}
      onSelectAssetType={onSelectAssetType}
      initialActiveSection="keyword"
    />
  );
};
