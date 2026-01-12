/**
 * Migration script to move image field to images array
 * 
 * PRODUCTION MIGRATION INSTRUCTIONS:
 * ===================================
 * 
 * Method 1: Using Convex CLI (Recommended for Production)
 * --------------------------------------------------------
 * 
 * 1. Make sure you're connected to your production deployment:
 *    npx convex deploy
 *    (Note: convex deploy targets production by default)
 * 
 * 2. Run the migration:
 *    npx convex run messages:migrateImageToAttachments
 *    (Note: convex run targets your current deployment)
 * 
 * 3. The migration will return a result like:
 *    {
 *      total: 150,
 *      migrated: 45,
 *      skipped: 105,
 *      errors: 0,
 *      message: "Migration complete: 45 messages migrated, 105 skipped, 0 errors"
 *    }
 * 
 * 4. Verify the results - check that migrated > 0 and errors === 0
 * 
 * 
 * Method 2: Using Convex Dashboard (Alternative)
 * ------------------------------------------------
 * 
 * 1. Go to https://dashboard.convex.dev
 * 2. Select your production deployment
 * 3. Navigate to "Functions" tab
 * 4. Find "messages:migrateImageToImages"
 * 5. Click "Run" button
 * 6. Review the returned result
 * 
 * 
 * IMPORTANT NOTES:
 * ================
 * 
 * - Run this migration ONCE in production
 * - The migration is idempotent (safe to run multiple times)
 * - Make sure your code is deployed before running
 * - Monitor the results for any errors
 * - After successful migration, the schema change (removing image field) 
 *   has already been deployed
 * 
 * 
 * VERIFICATION:
 * =============
 * 
 * After running, verify:
 * 1. Check that migrated count matches expected number of messages with images
 * 2. Check that errors === 0
 * 3. Test that existing messages with images still display correctly
 * 4. Test that new messages can upload multiple images
 */
