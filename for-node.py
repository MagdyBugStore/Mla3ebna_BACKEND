import os

# 1. Configuration
# For Node projects, we usually want the 'src' folder and specific root files
project_root = './'  # Start at root to catch config files
output_file = 'node_ts_code.txt'

# 2. Extensions to capture
valid_extensions = ('.ts', '.js', '.json', '.mjs', '.env.example')

# 3. Directories to skip entirely
excluded_dirs = {
    'node_modules', 'dist', 'build', 'coverage', 
    '.git', '.husky', '.vscode', 'out'
}

# 4. Specific files to ignore (optional)
excluded_files = {'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'}

with open(output_file, 'w', encoding='utf-8') as out_file:
    for root, dirs, files in os.walk(project_root):
        # Prune excluded directories
        dirs[:] = [d for d in dirs if d not in excluded_dirs]
        
        for file in files:
            # Check extension and ensure it's not a lockfile
            if file.endswith(valid_extensions) and file not in excluded_files:
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, start=project_root)

                out_file.write(f"// --- START OF FILE: {rel_path} ---\n")
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        out_file.write(f.read())
                except Exception as e:
                    out_file.write(f"// Error reading file: {e}")
                
                out_file.write(f"\n// --- END OF FILE: {rel_path} ---\n\n")

print(f"Successfully compiled project into {output_file}")
