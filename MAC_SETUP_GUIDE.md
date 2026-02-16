# 🍎 Mac Setup Guide - Step by Step

This guide will walk you through everything you need to get your Project Manager app running on Mac.

## Part 1: Install Required Software (15 minutes)

### Step 1: Install Homebrew (Mac Package Manager)

1. Open **Terminal** (Applications → Utilities → Terminal)
2. Copy and paste this command, then press Enter:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

3. Follow the prompts. You may need to enter your Mac password.
4. Wait for installation to complete (3-5 minutes)

### Step 2: Install Node.js

In Terminal, run:

```bash
brew install node
```

This installs both Node.js and npm (package manager).

Verify installation:
```bash
node --version
npm --version
```

You should see version numbers (e.g., v20.x.x)

### Step 3: Install Git

```bash
brew install git
```

Verify installation:
```bash
git --version
```

### Step 4: Configure Git (First Time Only)

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

Replace with your actual name and email.

---

## Part 2: Set Up Your Project (10 minutes)

### Step 1: Navigate to Your Project

```bash
# Go to Downloads (where you extracted the zip)
cd ~/Downloads/project-manager

# OR if you put it somewhere else:
cd ~/Desktop/project-manager
```

💡 **Tip**: You can drag the folder into Terminal instead of typing the path!

### Step 2: Install Project Dependencies

```bash
npm install
```

This downloads all required packages. Takes 2-3 minutes.

You'll see lots of text scrolling - this is normal!

### Step 3: Start the App

```bash
npm run dev
```

You should see:
```
VITE v5.x.x  ready in XXX ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

**Open your browser** and go to: http://localhost:3000

🎉 Your app is now running!

To stop the server, press: **Ctrl + C** in Terminal

---

## Part 3: Push to GitHub (20 minutes)

### Step 1: Create a GitHub Account

1. Go to https://github.com
2. Click "Sign Up"
3. Choose a username and create account

### Step 2: Create a New Repository

1. Click the **+** icon (top right) → "New repository"
2. Name it: `project-manager`
3. Keep it **Public** (for free hosting)
4. **DON'T** check "Initialize with README" (we already have one)
5. Click "Create repository"

### Step 3: Link Your Local Project to GitHub

GitHub will show you commands. Use these:

```bash
# Make sure you're in your project folder
cd ~/Downloads/project-manager

# Initialize git (if not already done)
git init

# Add all files
git add .

# Create first commit
git commit -m "Initial commit - React migration complete"

# Add GitHub as remote (REPLACE WITH YOUR URL)
git remote add origin https://github.com/YOUR_USERNAME/project-manager.git

# Push to GitHub
git branch -M main
git push -u origin main
```

💡 **Replace** `YOUR_USERNAME` with your actual GitHub username!

Enter your GitHub username and password when prompted.

**Password Note**: GitHub now uses "Personal Access Tokens" instead of passwords:
1. Go to GitHub → Settings → Developer Settings → Personal Access Tokens → Tokens (classic)
2. Generate new token
3. Select "repo" scope
4. Copy the token and use it as your password

---

## Part 4: Deploy to Vercel (10 minutes)

### Step 1: Create Vercel Account

1. Go to https://vercel.com
2. Click "Sign Up"
3. Choose "Continue with GitHub"
4. Authorize Vercel to access your GitHub

### Step 2: Deploy Your Project

1. Click "Add New Project"
2. Import your `project-manager` repository
3. Vercel auto-detects it's a Vite project
4. Click "Deploy"

Wait 1-2 minutes... ☕

### Step 3: Get Your Live URL

Once deployed, you'll get a URL like:
```
https://project-manager-abc123.vercel.app
```

Share this link with anyone! 🌐

---

## Part 5: Making Updates (Ongoing)

Whenever you want to update your app:

```bash
# 1. Make changes to your code

# 2. Save all files

# 3. In Terminal:
git add .
git commit -m "Describe what you changed"
git push

# Vercel automatically redeploys! (30-60 seconds)
```

---

## 🆘 Common Issues & Solutions

### "zsh: command not found: npm"

**Solution**: Node.js didn't install correctly.
```bash
brew reinstall node
```

### "Permission denied" errors

**Solution**: You might need sudo:
```bash
sudo npm install
```

### Terminal says "git: command not found"

**Solution**:
```bash
brew install git
```

### Can't push to GitHub - "Authentication failed"

**Solution**: Use a Personal Access Token instead of password
1. GitHub → Settings → Developer Settings → Personal Access Tokens
2. Generate new token
3. Use token as password when pushing

### Port 3000 already in use

**Solution**: Another app is using that port.
```bash
# Find what's using port 3000
lsof -i :3000

# Kill it (replace PID with the number shown)
kill -9 PID
```

Or change the port in `vite.config.js`:
```javascript
server: {
  port: 3001  // Change to any available port
}
```

---

## 📚 Useful Terminal Commands

```bash
# Where am I?
pwd

# What's in this folder?
ls

# Go to home directory
cd ~

# Go up one level
cd ..

# Clear the screen
clear

# Stop running process
Ctrl + C
```

---

## 🎓 Next Steps

1. ✅ App running locally (http://localhost:3000)
2. ✅ Code on GitHub
3. ✅ Live website on Vercel
4. 🚀 Ready to build features!

**Bookmark these links**:
- Your GitHub repo: `https://github.com/YOUR_USERNAME/project-manager`
- Your live site: `https://your-project.vercel.app`
- Vercel dashboard: `https://vercel.com/dashboard`

---

## 💪 You're All Set!

You now have:
- A professional development environment
- Version control with Git
- Automatic deployment with Vercel

Ready to build your Monday.com clone! 🎉

Need help? Check the main README.md or ask for assistance.
