# Project Manager Pro

A professional project management application with Gantt charts, RAID logs, and real-time collaboration features.

## 🚀 Features

- **Gantt Chart** - Visual project timeline with dependencies
- **Task Management** - Create, edit, and track tasks with progress
- **RAID Logs** - Risk, Issue, Action, and Decision tracking
- **Cost Register** - Budget and expense tracking
- **Change Control** - Manage project changes
- **Communication Plan** - Stakeholder management
- **Excel Export** - Export all data to spreadsheets
- **External View** - Share filtered views with stakeholders

## 📋 Prerequisites

Before you begin, you'll need to install:

1. **Node.js** (v18 or higher)
   - Download from: https://nodejs.org/
   - Choose the LTS (Long Term Support) version
   - This includes npm (Node Package Manager)

2. **Git**
   - Download from: https://git-scm.com/downloads
   - Follow the installation wizard with default settings

## 🛠️ Installation

### Step 1: Extract the Project

1. Download and extract the `project-manager.zip` file
2. Open Terminal (Applications → Utilities → Terminal)
3. Navigate to the project folder:
   ```bash
   cd ~/Downloads/project-manager
   ```

### Step 2: Install Dependencies

Run this command to install all required packages:

```bash
npm install
```

This will take 2-3 minutes and download all necessary libraries.

### Step 3: Start Development Server

```bash
npm run dev
```

Your app will open at: **http://localhost:3000**

## 🌐 Deploying to Vercel

### First Time Setup

1. **Create a Vercel Account**
   - Go to https://vercel.com
   - Click "Sign Up" and choose "Continue with GitHub"

2. **Install Vercel CLI** (Optional, for command line deployment)
   ```bash
   npm install -g vercel
   ```

3. **Deploy from GitHub** (Recommended Method)
   
   a. Push your code to GitHub:
   ```bash
   # Initialize git (first time only)
   git init
   git add .
   git commit -m "Initial commit"
   
   # Create a new repository on GitHub.com
   # Then link it and push:
   git remote add origin https://github.com/YOUR_USERNAME/project-manager.git
   git branch -M main
   git push -u origin main
   ```
   
   b. Import to Vercel:
   - Log into Vercel dashboard
   - Click "Add New Project"
   - Import your GitHub repository
   - Click "Deploy"
   
   That's it! Vercel will automatically build and deploy your app.

4. **Deploy via CLI** (Alternative Method)
   ```bash
   vercel
   ```
   Follow the prompts to deploy.

### Future Updates

After your initial deployment, any time you push to GitHub, Vercel automatically redeploys:

```bash
git add .
git commit -m "Your update message"
git push
```

## 📁 Project Structure

```
project-manager/
├── src/
│   ├── components/       # React components
│   │   ├── Header.jsx
│   │   ├── Navigation.jsx
│   │   ├── ScheduleView.jsx
│   │   ├── ScheduleGrid.jsx
│   │   ├── GanttChart.jsx
│   │   ├── RegisterView.jsx
│   │   └── TaskModal.jsx
│   ├── hooks/           # Custom React hooks
│   │   └── useProjectData.js
│   ├── utils/           # Helper functions
│   │   ├── constants.js
│   │   └── helpers.js
│   ├── styles/          # CSS files
│   │   └── index.css
│   ├── App.jsx          # Main app component
│   └── main.jsx         # Entry point
├── public/              # Static assets
├── index.html           # HTML template
├── package.json         # Dependencies
└── vite.config.js       # Build configuration
```

## 💡 Usage Tips

### Creating Tasks
1. Click "New Task" in the header
2. Fill in task details (name, dates, duration)
3. Set dependencies using Predecessor ID
4. Click "Save Changes"

### Managing Dependencies
- **FS (Finish-to-Start)**: Task B starts when Task A finishes
- **SS (Start-to-Start)**: Task B starts when Task A starts
- **FF (Finish-to-Finish)**: Task B finishes when Task A finishes
- **SF (Start-to-Finish)**: Task B finishes when Task A starts

### Track Actions
- Check the "Track" box to automatically create an action item
- Updates to the task will sync with the action log

### External View
- Toggle "External View" to share filtered data with stakeholders
- Only items marked as "public" (eye icon) will be visible

## 🔧 Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🐛 Troubleshooting

### "Command not found: npm"
- Node.js is not installed. Install from https://nodejs.org/

### Port 3000 already in use
- Change the port in `vite.config.js`
- Or kill the process using port 3000

### Build errors
- Delete `node_modules` folder and `package-lock.json`
- Run `npm install` again

## 🚧 Roadmap (Next Features)

- [ ] User authentication (Supabase)
- [ ] Real-time collaboration
- [ ] File attachments
- [ ] Comments and mentions
- [ ] Email notifications
- [ ] Custom templates
- [ ] Advanced reporting
- [ ] Mobile app

## 📝 License

This project is for personal and commercial use.

## 🤝 Support

For issues or questions, create an issue on GitHub or contact support.

---

Built with ❤️ using React + Vite + Tailwind CSS
