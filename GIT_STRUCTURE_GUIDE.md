# Git Repository Structure Guide

## 📁 Folder Structure Strategy

Project ini menggunakan strategi **"empty folder tracking"** dengan `.gitkeep` files.

### Concept:
- Git tidak bisa track folder kosong
- Solusi: Tambahkan file `.gitkeep` di folder yang ingin di-track
- File lain di folder tersebut tetap di-ignore

---

## 🎯 Current Configuration

### Folders with .gitkeep:

```
vas_vibe/
├── codes/.gitkeep           ✅ Folder tracked, contents ignored
├── specifications/.gitkeep  ✅ Folder tracked, contents ignored
└── tests/.gitkeep          ✅ Folder tracked, contents ignored
```

### .gitignore Rules:

```gitignore
# Ignore all files in folder
codes/*
specifications/*
tests/*

# But keep .gitkeep files
!codes/.gitkeep
!specifications/.gitkeep
!tests/.gitkeep
```

---

## 🔍 How It Works

### Pattern Explanation:

1. **`codes/*`** - Ignore semua file di dalam folder `codes/`
2. **`!codes/.gitkeep`** - Tapi **jangan** ignore file `.gitkeep`

Simbol `!` adalah **negation pattern** yang membatalkan ignore rule sebelumnya.

---

## ✅ Verification

### Check what gets tracked:

```bash
# See all tracked files
git add .
git status

# Output should show:
#   .gitignore
#   codes/.gitkeep
#   specifications/.gitkeep
#   tests/.gitkeep
#   README.md
```

### Check what gets ignored:

```bash
# See ignored files
git status --ignored

# Output should show:
#   codes/ (all files except .gitkeep)
#   specifications/ (all files except .gitkeep)
#   tests/ (all files except .gitkeep)
```

---

## 📊 Result

### When someone clones the repository:

```bash
git clone <repository-url>
cd vas_vibe
ls -la
```

**They will get:**
```
vas_vibe/
├── .gitignore              ✅ Present
├── README.md               ✅ Present
├── codes/                  ✅ Folder exists (empty except .gitkeep)
│   └── .gitkeep            ✅ Present
├── specifications/         ✅ Folder exists (empty except .gitkeep)
│   └── .gitkeep            ✅ Present
└── tests/                  ✅ Folder exists (empty except .gitkeep)
    └── .gitkeep            ✅ Present
```

**They will NOT get:**
- ❌ Files in `codes/` (except `.gitkeep`)
- ❌ Files in `specifications/` (except `.gitkeep`)
- ❌ Files in `tests/` (except `.gitkeep`)
- ❌ `project_overview.md`
- ❌ `development_log.md`

---

## 🎯 Use Cases

### Scenario 1: Fresh Clone
```bash
git clone <repo>
cd vas_vibe
# Folders exist but are empty
# Developer can start adding code to codes/ folder
```

### Scenario 2: Working with Code
```bash
cd codes
npm install
npm run dev
# All development files stay local
# .gitkeep ensures folder structure is preserved
```

### Scenario 3: Team Collaboration
```bash
# Each developer has:
# - Same folder structure (thanks to .gitkeep)
# - Own local code (not tracked)
# - Shared documentation (README, etc.)
```

---

## 💡 Advanced Patterns

### If you want to track SOME files in codes:

```gitignore
# In .gitignore:
codes/*
!codes/.gitkeep
!codes/important-config.json
!codes/README.md
```

### If you want to track a subfolder:

```gitignore
# In .gitignore:
codes/*
!codes/.gitkeep
!codes/shared/
codes/shared/*
!codes/shared/.gitkeep
```

---

## 🔧 Common Commands

### Add everything (respecting .gitignore):
```bash
git add .
```

### Check what will be committed:
```bash
git status
```

### See ignored files:
```bash
git status --ignored
```

### Force add an ignored file (if needed):
```bash
git add -f codes/special-file.ts
```

### Remove a file from tracking (keep local):
```bash
git rm --cached codes/some-file.ts
```

---

## 📝 Benefits

### ✅ Pros:
1. **Folder structure preserved** - New developers get correct structure
2. **No accidental commits** - Code stays local
3. **Clean repository** - Only essential files tracked
4. **Easy setup** - Clone and start coding
5. **Flexible** - Can add exceptions with `!` pattern

### ⚠️ Considerations:
1. Must document which files go in which folder
2. Developers need to know structure
3. `.gitkeep` files add minimal overhead

---

## 🎓 Best Practices

### DO:
- ✅ Keep `.gitkeep` files simple (just a comment)
- ✅ Document folder purpose in `.gitkeep`
- ✅ Use consistent naming (`.gitkeep` is convention)
- ✅ Add README.md in root to explain structure

### DON'T:
- ❌ Put important code in `.gitkeep`
- ❌ Forget to add `!` negation in `.gitignore`
- ❌ Delete `.gitkeep` files
- ❌ Track both folder contents AND use `.gitkeep`

---

## 📚 References

### Git Ignore Patterns:
- `*` - Match all files
- `!` - Negate previous pattern
- `*/` - Match directories only
- `**` - Match nested directories

### Examples:
```gitignore
# Ignore all .log files
*.log

# But keep important.log
!important.log

# Ignore all in folder
folder/*

# But keep .gitkeep
!folder/.gitkeep
```

---

## ✅ Current Status

```
Repository Structure: ✅ Configured
.gitkeep Files: ✅ Created (3 files)
.gitignore Rules: ✅ Updated with negation
Folder Tracking: ✅ Active
Contents Ignored: ✅ Working
```

**Ready to commit and push!** 🚀

---

**Last Updated:** June 2026  
**Status:** ✅ Complete
