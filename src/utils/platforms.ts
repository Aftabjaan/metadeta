import { Marketplace, MarketplaceProfile } from '../types';

const ADOBE_PROFILE: MarketplaceProfile = {
  id: 'adobe',
  name: 'Adobe Stock',
  badge: 'Adobe Stock Contributor',
  titleMinLength: 15,
  titleMaxLength: 200,
  minKeywords: 5,
  maxKeywords: 49, // Adobe Stock accepts up to 49-50, first 10 carry highest algorithmic weight
  allowedCategories: [
    'Animals', 'Buildings and Architecture', 'Business', 'Drinks', 'Environment',
    'States of Mind', 'Food', 'Graphic Resources', 'Hobbies and Leisure', 'Industry',
    'Landscape', 'Lifestyle', 'People', 'Plants and Flowers', 'Culture and Religion',
    'Science', 'Social Issues', 'Sports', 'Technology', 'Transport', 'Travel'
  ],
  csvColumns: [
    { key: 'originalFilename', header: 'Filename' },
    { key: 'title', header: 'Title' },
    { key: 'keywords', header: 'Keywords' },
    { key: 'category', header: 'Category' }
  ],
  rules: [
    'Visual relevance + Search intent + Commercial usefulness prioritised',
    'First 10 keywords MUST carry the highest algorithmic weight',
    'Titles must be natural, descriptive, and searchable (no keyword stuffing)',
    'No standalone filler words (the, and, with, for, of, etc.)',
    'No trademarks, brand names, or copyrighted terms',
    'Max 49-50 keywords; duplicates cause upload rejection'
  ],
  notes: 'Requires exact matching original filename. Keywords separated by commas.'
};

export const MARKETPLACE_PROFILES: Record<Marketplace, MarketplaceProfile> = {
  adobe: ADOBE_PROFILE,
  shutterstock: ADOBE_PROFILE,
  freepik: ADOBE_PROFILE,
  istock: ADOBE_PROFILE,
  alamy: ADOBE_PROFILE,
  dreamstime: ADOBE_PROFILE,
  generic: ADOBE_PROFILE,
};

export const DEFAULT_CATEGORIES = [
  'Animals', 'Buildings and Architecture', 'Business', 'Drinks', 'Environment',
  'States of Mind', 'Food', 'Graphic Resources', 'Hobbies and Leisure', 'Industry',
  'Landscape', 'Lifestyle', 'People', 'Plants and Flowers', 'Culture and Religion',
  'Science', 'Social Issues', 'Sports', 'Technology', 'Transport', 'Travel'
];
