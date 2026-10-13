export type Marketplace =
  | 'adobe'
  | 'shutterstock'
  | 'freepik'
  | 'istock'
  | 'alamy'
  | 'dreamstime'
  | 'generic';

export type AssetType =
  | 'photo'
  | 'vector'
  | 'illustration'
  | '3d_render'
  | 'png'
  | 'background'
  | 'icon'
  | 'wallpaper'
  | 'pattern'
  | 'abstract';

export type Orientation = 'horizontal' | 'vertical' | 'square' | 'panoramic';

export interface TitleSettings {
  lengthMode?: 'short' | 'standard' | 'long' | 'extra_long' | 'custom';
  customLength?: number;
  minLength?: number;
  maxLength: number;
  style?: 'SEO Optimized' | 'Natural' | 'Commercial' | 'Descriptive' | 'Creative' | string;
  backgroundSuffix?: 'none' | 'isolated_transparent' | 'isolated_white' | 'isolated_black' | 'isolated_png_transparent' | string;
  customInstructions?: string;
  avoidRepetition?: boolean;
  commerciallyRelevant?: boolean;
  matchAssetContent?: boolean;
  adobeStockOptimized?: boolean;
}

export interface KeywordSettings {
  targetCount: number;
  isCustomCount?: boolean;
  customCount?: number;
  ordering?: 'relevance' | 'seo_priority' | 'balanced' | 'broad_to_specific' | string;
  keywordType?: 'single' | 'phrases' | 'mixed' | string;
  style?: string;
  customInstructions?: string;
  enforceRelevance?: boolean;
  removeDuplicates?: boolean;
  removeMeaningless?: boolean;
  prioritizeStrongest?: boolean;
}

export interface DescriptionSettings {
  minLength: number;
  maxLength: number;
  relevantToAsset?: boolean;
  noKeywordStuffing?: boolean;
  commerciallyUseful?: boolean;
  adobeStockOptimized?: boolean;
}

export type BackgroundTypeOption =
  | 'auto'
  | 'transparent'
  | 'white'
  | 'black'
  | 'light'
  | 'dark'
  | 'colorful'
  | 'isolated'
  | 'no_background'
  | 'unknown';

export interface BackgroundSettings {
  userBackgroundType?: BackgroundTypeOption;
}

export interface KeywordItem {
  word: string;
  relevance?: number;
  category?: 'primary' | 'secondary' | 'concept' | 'color' | 'style' | 'filler';
  score?: number;
  priority?: 'primary' | 'secondary' | 'supporting';
}

export type AssetStatus = 'waiting' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type AdobeSafetyStatus = 'SAFE' | 'WARNING' | 'BLOCK';

export interface AdobeSafetyIssue {
  type:
    | 'trademark'
    | 'artist'
    | 'celebrity'
    | 'character'
    | 'keyword_spam'
    | 'duplicate'
    | 'background_mismatch'
    | 'length'
    | 'count'
    | 'similarity'
    | 'relevance'
    | 'quality'
    | 'banned_term';
  severity: 'block' | 'warning';
  field: 'title' | 'description' | 'keywords' | 'category' | 'general';
  message: string;
  remedy?: string;
  detectedWords?: string[];
}

export interface AdobeSafetyCheckResult {
  status: AdobeSafetyStatus;
  score: number; // 0 - 100 safety score
  issues: AdobeSafetyIssue[];
  summary: string;
}

export interface BackgroundAnalysis {
  isTransparent: boolean;
  isPartiallyTransparent: boolean;
  hasAlphaChannel: boolean;
  transparentPercentage: number;
  borderTransparentPercentage: number;
  backgroundType: 'transparent' | 'transparent_cutout' | 'white' | 'black' | 'solid_color' | 'full_scene';
  backgroundDescription: string;
  isIsolatedObject: boolean;
  warnings?: string[];
}

export interface PromptBuildOptions {
  marketplace: Marketplace;
  selectedMarketplaces?: Marketplace[];
  assetType: AssetType;
  titleSettings: TitleSettings;
  keywordSettings: KeywordSettings;
  backgroundSettings?: BackgroundSettings;
  aiGeneratedFlag?: boolean;
  backgroundAnalysis?: BackgroundAnalysis;
  fileContentHash?: string;
  bypassCache?: boolean;
  existingBatchTitles?: string[];
  existingBatchKeywords?: string[];
  assetIndex?: number;
}

export interface SeoCheck {
  label: string;
  passed: boolean;
  tip?: string;
  details?: string;
  category?: 'title' | 'keywords' | 'description' | 'platform';
}

export interface QualityCategoryScore {
  name: string;
  score: number;
  max: number;
}

export interface SeoBreakdown {
  score: number;
  rating?: 'Excellent' | 'Good' | 'Needs Improvement' | 'Poor';
  grade?: string;
  categoryScores?: QualityCategoryScore[];
  checks: SeoCheck[];
  recommendations: string[];
}

export interface MarketplaceMetadata {
  marketplace: Marketplace;
  title: string;
  keywords: KeywordItem[];
  category: string;
  seoScore: number;
  seoBreakdown?: SeoBreakdown;
  rulesApplied?: string[];
}

export interface AssetAnalysisData {
  subjects: string[];
  visualStyle: string;
  lighting: string;
  colors: string[];
  background: string;
  imageType: string;
  composition: string;
}

export interface MarketResearchData {
  opportunity: string;
  commercialConcepts: string[];
  relevantTrends: string[];
  seasonalOpportunity: string;
  searchIntent: string;
  keywordOpportunities: string[];
  confidence: 'High' | 'Medium' | 'Limited';
}

export interface StockMetadata {
  title: string;
  keywords: KeywordItem[];
  category: string;
  assetType: AssetType;
  orientation: Orientation;
  aiGenerated: boolean;
  isTitleManuallyEdited?: boolean;
  seoScore: number;
  seoBreakdown?: SeoBreakdown;
  adobeSafety?: AdobeSafetyCheckResult;
  backgroundAnalysis?: BackgroundAnalysis;
  titleSettings?: TitleSettings;
  marketplaces?: Partial<Record<Marketplace, MarketplaceMetadata>>;
  activeMarketplace?: Marketplace;
  aiProvider?: string;
  aiModel?: string;
  commercialIntent?: string;
  safetyStatus?: string;
  assetAnalysis?: AssetAnalysisData;
  marketResearch?: MarketResearchData;
}

export interface MetadataVersion {
  version?: number;
  versionNumber?: number;
  timestamp: string;
  title?: string;
  keywords?: KeywordItem[];
  category?: string;
  seoScore?: number;
  metadata?: StockMetadata;
  note?: string;
}

export type VisualSimilarityLevel = 'EXACT_DUPLICATE' | 'HIGH_SIMILARITY' | 'MODERATE_SIMILARITY' | 'UNIQUE';

export interface StockAssetErrorInfo {
  type: string;
  message: string;
  retryable: boolean;
  timestamp: string;
  attemptedProvider?: 'groq' | 'gemini' | 'openai' | null;
}

export interface StockAsset {
  id: string; // Internal identifier only
  originalFilename: string; // CRITICAL: exact File.name, strictly preserved everywhere in UI & CSV
  fileSize: number;
  mimeType: string;
  thumbnailUrl?: string; // WebP or JPEG thumbnail for efficient memory usage
  backgroundAnalysis?: BackgroundAnalysis;
  fileContentHash?: string; // SHA-256 hash of raw file content
  visualFingerprint?: string; // Perceptual dHash + color histogram
  isDuplicate?: boolean; // Flagged if exact duplicate in batch
  duplicateOfId?: string;
  duplicateOfFilename?: string;
  duplicateReason?: string;
  duplicateDismissed?: boolean;
  visualSimilarityLevel?: VisualSimilarityLevel;
  visualSimilarityScore?: number;
  visualSimilarityDetails?: string;
  similarityWarning?: string;
  metadata?: StockMetadata;
  versions: MetadataVersion[];
  status: AssetStatus;
  generationStatus?: 'completed' | 'processing' | 'failed';
  providerUsed?: 'groq' | 'gemini' | 'openai' | null;
  modelUsed?: string;
  processingTimeMs?: number;
  errorInfo?: StockAssetErrorInfo | null;
  error?: string;
  errorMessage?: string;
  uploadedAt: string;
}

export interface Project {
  id: string;
  userId?: string;
  name: string;
  description?: string;
  marketplace: Marketplace;
  selectedMarketplaces?: Marketplace[];
  assetType: AssetType;
  titleSettings: TitleSettings;
  keywordSettings: KeywordSettings;
  backgroundSettings?: BackgroundSettings;
  items: StockAsset[];
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  fullName?: string;
  avatarUrl?: string;
  provider?: string;
  createdAt?: string;
}

export type AIProvider = 'gemini' | 'groq' | 'openai' | 'auto';

export interface ApiKeyEntry {
  id: string;
  userId?: string;
  provider: 'gemini' | 'groq' | 'openai';
  label: string;
  maskedKey: string;
  enabled: boolean;
  active?: boolean;
  isEnvKey?: boolean;
  status: 'active' | 'cooldown' | 'error' | 'untested';
  requestCount: number;
  successCount: number;
  failureCount: number;
  lastUsed?: string;
  lastError?: string;
  cooldownUntil?: string;
  selectedModel?: string;
  lastTested?: string;
  discoveredModels?: string[];
}

export interface BulkImportResult {
  totalDetected: number;
  added: number;
  duplicatesSkipped: number;
  invalidKeysSkipped: number;
  addedKeys?: ApiKeyEntry[];
}

export interface ApiUsageStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitedRequests: number;
  imagesProcessed: number;
  avgProcessingTimeMs: number;
  averageProcessingTimeMs?: number;
  lastUsedProvider?: string;
  geminiRequests?: number;
  geminiSuccess?: number;
  geminiFailed?: number;
  groqRequests?: number;
  groqSuccess?: number;
  groqFailed?: number;
  openaiRequests?: number;
  openaiSuccess?: number;
  openaiFailed?: number;
  dailyHistory?: { date: string; geminiRequests: number; groqRequests: number; openaiRequests?: number }[];
}

export interface MarketplaceProfile {
  id: Marketplace;
  name: string;
  badge: string;
  titleMinLength: number;
  titleMaxLength: number;
  minKeywords: number;
  maxKeywords: number;
  allowedCategories: string[];
  csvColumns: { key: keyof StockMetadata | 'originalFilename'; header: string }[];
  rules: string[];
  notes: string;
}

export interface ProcessingSettings {
  concurrency: number;
  retryCount: number;
  provider?: AIProvider;
  preferredProvider?: AIProvider;
  groqModel: string;
  geminiModel: string;
  enableAutoSave?: boolean;
  autoRotation?: boolean;
  autoFallback?: boolean;
}

export interface SearchTrend {
  topic: string;
  description: string;
  growth: string;
  keywords: string[];
}
