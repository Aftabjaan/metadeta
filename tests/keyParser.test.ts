import { parseKeysFromText, isValidKeyToken } from '../src/utils/keyParser';

// Test Runner
function runKeyParserTests() {
  console.log('--- RUNNING KEY PARSER REGRESSION TESTS ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // 1. Two real keys in TXT
  const test1Input = `AIzaSyD_abc-1234567890XYZ
gsk_testKeyWith_Underscores-AndHyphens987`;
  const res1 = parseKeysFromText(test1Input);
  assert(res1.tokens.length === 2, '2 keys in TXT should yield exactly 2 tokens');
  assert(res1.tokens[0] === 'AIzaSyD_abc-1234567890XYZ', 'First key token matches exactly without fragmentation');
  assert(res1.tokens[1] === 'gsk_testKeyWith_Underscores-AndHyphens987', 'Second key token matches exactly');

  // 2. Hyphen and Underscore preservation test (Must NOT split on hyphens)
  const test2Input = 'KEY-A-123\nKEY-B-456';
  const res2 = parseKeysFromText(test2Input);
  assert(res2.tokens.length === 2, 'KEY-A-123 and KEY-B-456 should parse to 2 tokens');
  assert(res2.tokens[0] === 'KEY-A-123', 'Hyphenated key preserved completely');

  // 3. Single key
  const test3Input = 'AIzaSyBNM1234567890';
  const res3 = parseKeysFromText(test3Input);
  assert(res3.tokens.length === 1, 'Single key parsed to 1 token');

  // 4. Duplicate keys in same text
  const test4Input = `AIzaSyDuplicateKey12345678
AIzaSyDuplicateKey12345678
AIzaSyDuplicateKey12345678`;
  const res4 = parseKeysFromText(test4Input);
  assert(res4.totalDetected === 3, 'Detected 3 raw lines');
  assert(res4.tokens.length === 1, 'Deduplicated to 1 unique token');
  assert(res4.duplicateCount === 2, '2 duplicates recorded');

  // 5. Empty lines, numbering, and whitespace
  const test5Input = `
  1. AIzaSyTestNumberOne123456789
  
  - AIzaSyTestBulletTwo123456789
  
  "AIzaSyTestQuotesThree123456789"
  `;
  const res5 = parseKeysFromText(test5Input);
  assert(res5.tokens.length === 3, 'Sanitized numbers, bullets, and quotes to 3 tokens');
  assert(res5.tokens[0] === 'AIzaSyTestNumberOne123456789', 'Stripped list number');
  assert(res5.tokens[1] === 'AIzaSyTestBulletTwo123456789', 'Stripped list bullet');
  assert(res5.tokens[2] === 'AIzaSyTestQuotesThree123456789', 'Stripped surrounding quotes');

  // 6. Comma separated keys
  const test6Input = 'AIzaKeyA1234567890, AIzaKeyB1234567890, AIzaKeyC1234567890';
  const res6 = parseKeysFromText(test6Input);
  assert(res6.tokens.length === 3, 'Comma-separated string parsed to 3 tokens');

  // 7. Validation rules
  assert(isValidKeyToken('AIzaSyD_abc-1234567890XYZ').valid === true, 'Valid Gemini key token');
  assert(isValidKeyToken('gsk_testKeyWith_Underscores-AndHyphens987').valid === true, 'Valid Groq key token');
  assert(isValidKeyToken('abc').valid === false, 'Short token rejected');
  assert(isValidKeyToken('invalid key with spaces').valid === false, 'Space containing token rejected');

  console.log(`\nSUMMARY: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runKeyParserTests();
