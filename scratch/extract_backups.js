const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function extract() {
    const transcriptPath = 'C:/Users/USER/.gemini/antigravity/brain/dc7b9c0f-37b3-4522-a847-70cfd3536590/.system_generated/logs/transcript.jsonl';
    const targetDirs = [
        'c:\\users\\user\\.gemini\\antigravity\\scratch\\linebot\\services\\',
        'c:\\users\\user\\.gemini\\antigravity\\scratch\\linebot\\handlers\\'
    ];
    
    // Track the latest complete content or the latest sequence of edits
    const fileContents = {}; // path -> latest CodeContent
    
    const fileStream = fs.createReadStream(transcriptPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
        try {
            const entry = JSON.parse(line);
            if (!entry.tool_calls) continue;
            
            for (const call of entry.tool_calls) {
                if (call.name === 'write_to_file' && call.args && call.args.TargetFile) {
                    const target = call.args.TargetFile.toLowerCase();
                    if (targetDirs.some(dir => target.startsWith(dir))) {
                        fileContents[target] = call.args.CodeContent;
                    }
                }
                if (call.name === 'multi_replace_file_content' && call.args && call.args.TargetFile) {
                    const target = call.args.TargetFile.toLowerCase();
                    if (fileContents[target]) {
                        // Attempt to apply patches
                        let content = fileContents[target];
                        const lines = content.split('\n');
                        // Just a simplistic patch apply, since this is too complex, let's see if we can just get away with write_to_file.
                        // Actually, wait, multi_replace_file_content uses TargetContent to match. We can just run string replace!
                        const chunks = call.args.ReplacementChunks || [];
                        for (const chunk of chunks) {
                            if (chunk.TargetContent && chunk.ReplacementContent) {
                                content = content.replace(chunk.TargetContent, chunk.ReplacementContent);
                            }
                        }
                        fileContents[target] = content;
                    }
                }
            }
        } catch(e) {}
    }
    
    console.log(`Found ${Object.keys(fileContents).length} files in transcript.`);
    for (const [filepath, content] of Object.entries(fileContents)) {
        // We will only overwrite files that contain '?' or have syntax errors.
        // Actually, let's just write them out to a backup folder first!
        const basename = path.basename(filepath);
        const outPath = path.join(__dirname, 'recovered_' + basename);
        fs.writeFileSync(outPath, content, 'utf8');
    }
    console.log('Recovery files written to scratch/recovered_*.js');
}

extract();
