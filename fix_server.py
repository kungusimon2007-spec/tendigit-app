import os

# If a server file exists, replace it with a simple static file server that serves public/index.html directly
server_code = """
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log('NexusHub server running on port ' + PORT);
});
"""

for fname in ["server.js", "app.js", "index.js"]:
    if os.path.exists(fname):
        with open(fname, "w") as f:
            f.write(server_code)
        print(f"Simplified {fname} to serve static files directly.")
        break
