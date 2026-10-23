import os

menu_code = """
<!-- NexusHub Hamburger Menu & Settings Drawer -->
<div id="nexus-menu-container">
  <button id="hamburger-btn" onclick="toggleNexusMenu()" style="position:fixed; top:15px; left:15px; z-index:9999; background:#0f172a; color:white; border:none; padding:10px 14px; border-radius:8px; font-size:20px; cursor:pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">☰</button>
  
  <div id="nexus-drawer" style="position:fixed; top:0; left:-280px; width:280px; height:100%; background:#0f172a; color:white; z-index:10000; transition:left 0.3s ease; box-shadow: 4px 0 15px rgba(0,0,0,0.5); padding:20px; box-sizing:border-box;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px; border-bottom:1px solid #334155; padding-bottom:15px;">
      <h2 style="margin:0; font-size:20px; font-weight:bold; color:#38bdf8;">NexusHub</h2>
      <button onclick="toggleNexusMenu()" style="background:none; border:none; color:white; font-size:24px; cursor:pointer;">&times;</button>
    </div>
    
    <ul style="list-style:none; padding:0; margin:0;">
      <li style="margin-bottom:20px;"><a href="#" onclick="openProfileModal(); return false;" style="color:white; text-decoration:none; font-size:16px; display:block; padding:10px; border-radius:6px; background:#1e293b;">👤 Edit Profile</a></li>
      <li style="margin-bottom:20px;"><a href="#" onclick="openSettingsModal(); return false;" style="color:white; text-decoration:none; font-size:16px; display:block; padding:10px; border-radius:6px; background:#1e293b;">⚙️ Settings</a></li>
      <li style="margin-bottom:20px;"><a href="#" onclick="alert('NexusHub v1.0 - Professional PWA'); return false;" style="color:white; text-decoration:none; font-size:16px; display:block; padding:10px; border-radius:6px; background:#1e293b;">ℹ️ About App</a></li>
      <li style="margin-bottom:20px;"><a href="#" onclick="location.reload(); return false;" style="color:white; text-decoration:none; font-size:16px; display:block; padding:10px; border-radius:6px; background:#ef4444;">🚪 Logout / Refresh</a></li>
    </ul>
  </div>
</div>

<script>
function toggleNexusMenu() {
  const drawer = document.getElementById("nexus-drawer");
  if (drawer.style.left === "0px") {
    drawer.style.left = "-280px";
  } else {
    drawer.style.left = "0px";
  }
}
function openProfileModal() {
  alert("Profile Editor: Update your username, bio, and avatar here!");
  toggleNexusMenu();
}
function openSettingsModal() {
  alert("Settings: Toggle Dark Mode, Notifications, and Privacy options.");
  toggleNexusMenu();
}
</script>
"""

# Find the main HTML or view file
for root, dirs, files in os.walk("."):
    for file in files:
        if file.endswith((".html", ".ejs", ".jsx", ".tsx")) and not file.startswith("node_modules"):
            path = os.path.join(root, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            
            if "nexus-menu-container" not in content and "<body>" in content:
                content = content.replace("<body>", "<body>\n" + menu_code)
                with open(path, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"Successfully added hamburger menu to {path}")
                break
