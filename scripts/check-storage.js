const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.log('❌ Credenciais não configuradas');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkStorage() {
    console.log('🔍 Checking Storage Content (Bucket: indicacoes)...');

    // 1. List folders (which are userIds)
    const { data: rootFolders, error: rootError } = await supabase.storage
        .from('indicacoes')
        .list();

    if (rootError) {
        console.error('❌ Error listing root:', rootError);
        return;
    }

    console.log(`📂 Found ${rootFolders.length} items in root.`);

    if (rootFolders.length === 0) {
        console.log('⚠️ Bucket seems empty or folders handling is different.');
    }

    // 2. Try to peek into the first folder
    for (const folder of rootFolders.slice(0, 3)) { // Check first 3
        console.log(`\n📂 Checking folder: ${folder.name} (ID: ${folder.id || 'N/A'})`);

        const { data: subItems, error: subError } = await supabase.storage
            .from('indicacoes')
            .list(folder.name); // folder.name is likely the userId

        if (subError) {
            console.error(`  ❌ Error listing subfolder ${folder.name}:`, subError);
            continue;
        }

        console.log(`  found ${subItems.length} items.`);
        subItems.forEach(item => console.log(`   - ${item.name} (${(item.metadata?.size / 1024).toFixed(2)} KB)`));

        // Check inside valid-looking subfolders (indicationIds)
        for (const subItem of subItems.slice(0, 3)) {
            if (!subItem.name.includes('.')) { // assume it's a folder if no extension
                console.log(`    📂 Checking subfolder: ${folder.name}/${subItem.name}`);
                const { data: files, error: filesError } = await supabase.storage
                    .from('indicacoes')
                    .list(`${folder.name}/${subItem.name}`);

                if (filesError) {
                    console.error(`      ❌ Error:`, filesError);
                } else {
                    files.forEach(f => console.log(`       📄 ${f.name} (${(f.metadata?.size / 1024).toFixed(2)} KB)`));
                }
            }
        }
    }
}

checkStorage();
