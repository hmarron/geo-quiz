const fs = require('fs');
const readline = require('readline');

const CSV_FILE = 'birds.csv';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (query) => new Promise(resolve => rl.question(query, resolve));

async function main() {
    if (!fs.existsSync(CSV_FILE)) {
        console.error(`File not found: ${CSV_FILE}`);
        process.exit(1);
    }

    let data = fs.readFileSync(CSV_FILE, 'utf8');
    let lines = data.split('\n');
    let header = lines[0];
    let rows = lines.slice(1).filter(line => line.trim() !== '');
    
    // Count how many total birds are missing images at the start
    const missingIndices = rows
        .map((row, index) => ({ row, index }))
        .filter(item => item.row.split(',')[2] === 'image missing');
    
    const totalToFill = missingIndices.length;
    let completed = 0;

    console.log('--- Bird Image Linker ---');
    console.log(`Found ${totalToFill} birds missing images.`);
    console.log('Type "exit" to quit. Progress is saved after every entry.\n');

    for (const { index } of missingIndices) {
        const parts = rows[index].split(',');
        const [id, name, media, ...categories] = parts;

        const searchQuery = encodeURIComponent(name + ' bird');
        const searchUrl = `https://www.google.com/search?q=${searchQuery}&tbm=isch`;
        
        completed++;
        console.log(`\nBird: ${name}`);
        console.log(`Search: ${searchUrl}`);
        
        const input = await ask(`[${completed}/${totalToFill}] URL: `);
        
        if (input.toLowerCase() === 'exit') {
            console.log('Exiting...');
            break;
        }

        if (input.trim()) {
            // Update the row in memory
            rows[index] = [id, name, input.trim(), ...categories].join(',');
            
            // Write the entire file back to disk immediately
            const newContent = [header, ...rows].join('\n') + '\n';
            fs.writeFileSync(CSV_FILE, newContent);
            console.log('Saved.');
        } else {
            console.log('Skipped.');
        }
    }

    console.log(`\nFinished session. ${completed} processed.`);
    rl.close();
}

main();
