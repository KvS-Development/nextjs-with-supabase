import { createClient } from '@supabase/supabase-js'
import { Repository, SingletonRepository, BaseClass, DatabaseStorable } from './repositories'

// Initialize Supabase client
const supabase = createClient('your-supabase-url', 'your-anon-key')

// ============================================
// Example 1: Project Documents (multiple per user)
// ============================================

// Define all versions of the data
interface ProjectDataV1 extends DatabaseStorable {
  version: 1
  typeName: 'projects'
  title: string
  owner: string // old field
  description: string
  publicRead?: boolean
}

interface ProjectDataV2 extends DatabaseStorable {
  version: 2
  typeName: 'projects'
  title: string
  members: string[] // replaced owner
  description: string
  priority: number // new field
  publicRead?: boolean
  publicUpdate?: boolean
}

// Current version
type ProjectData = ProjectDataV2
type ProjectVersions = ProjectDataV1 | ProjectDataV2
const PROJECT_VERSION = 2

class Project extends BaseClass<ProjectData> {
  // Computed properties
  get searchableText(): string {
    return `${this.data.title} ${this.data.description}`.toLowerCase()
  }
  
  get isPublic(): boolean {
    return this.data.publicRead === true
  }
  
  get highPriority(): boolean {
    return this.data.priority > 7
  }
  
  // Methods
  addMember(userId: string): Project {
    return new Project({
      ...this.data,
      members: [...this.data.members, userId]
    })
  }
  
  updateTitle(title: string): Project {
    return new Project({
      ...this.data,
      title
    })
  }
  
  // Type-safe migration with discriminated union
  migrate(data: unknown): ProjectData {
    const input = data as ProjectVersions
    
    switch (input.version) {
      case undefined:
      case 1:
        // TypeScript knows this is ProjectDataV1
        const v1 = input as ProjectDataV1
        return {
          version: 2,
          typeName: 'projects',
          title: v1.title,
          members: [v1.owner], // Transform owner to members array
          description: v1.description,
          priority: 5, // Default priority
          publicRead: v1.publicRead,
          publicUpdate: false // New field default
        }
      
      case 2:
        // Already current version
        return input as ProjectDataV2
      
      default:
        // This helps catch if we forgot to handle a version
        throw new Error(`Unknown project version: ${(input as any).version}`)
    }
  }
}

// Create repository
const projectRepo = new Repository(
  supabase,
  'projects',
  Project,
  PROJECT_VERSION
)

// Usage examples
async function projectExamples() {
  // Create new project
  const newProject = new Project({
    version: PROJECT_VERSION,
    typeName: 'projects',
    title: 'My New Project',
    members: ['user-id-1'],
    description: 'A cool project',
    priority: 8,
    publicRead: true,
    publicUpdate: false
  })
  
  const projectId = await projectRepo.save(newProject)
  console.log('Created project:', projectId)
  
  // Get project - automatically migrated if old version
  const project = await projectRepo.get(projectId)
  if (project) {
    console.log('Is high priority?', project.highPriority)
    
    // Update project
    const updated = project.updateTitle('Updated Title')
    await projectRepo.update(projectId, updated)
  }
  
  // List user's projects
  const projects = await projectRepo.list({
    limit: 10,
    orderBy: 'priority',
    ascending: false
  })
  
  // Search projects
  const searchResults = await projectRepo.search('cool', ['title', 'description'])
  
  // Delete project
  await projectRepo.delete(projectId)
}

// ============================================
// Example 2: User Settings (singleton)
// ============================================

// Define all versions of the data
interface UserSettingsDataV1 extends DatabaseStorable {
  version: 1
  typeName: 'user_settings'
  theme: 'light' | 'dark'
  emailNotifications: boolean
}

interface UserSettingsDataV2 extends DatabaseStorable {
  version: 2
  typeName: 'user_settings'
  theme: 'light' | 'dark' | 'auto' // added auto option
  notifications: { // restructured
    email: boolean
    push: boolean
    sms: boolean
  }
  language: string // new field
}

// Current version
type UserSettingsData = UserSettingsDataV2
type UserSettingsVersions = UserSettingsDataV1 | UserSettingsDataV2
const SETTINGS_VERSION = 2

class UserSettings extends BaseClass<UserSettingsData> {
  // Computed properties
  get hasNotifications(): boolean {
    return this.data.notifications.email || 
           this.data.notifications.push || 
           this.data.notifications.sms
  }
  
  // Methods
  toggleEmailNotifications(): UserSettings {
    return new UserSettings({
      ...this.data,
      notifications: {
        ...this.data.notifications,
        email: !this.data.notifications.email
      }
    })
  }
  
  setTheme(theme: UserSettingsData['theme']): UserSettings {
    return new UserSettings({
      ...this.data,
      theme
    })
  }
  
  // Type-safe migration with discriminated union
  migrate(data: unknown): UserSettingsData {
    const input = data as UserSettingsVersions
    
    switch (input.version) {
      case undefined:
      case 1:
        // TypeScript knows this is UserSettingsDataV1
        const v1 = input as UserSettingsDataV1
        return {
          version: 2,
          typeName: 'user_settings',
          theme: v1.theme === 'light' || v1.theme === 'dark' 
            ? v1.theme 
            : 'auto',
          notifications: {
            email: v1.emailNotifications || false,
            push: false,
            sms: false
          },
          language: 'en'
        }
      
      case 2:
        // Already current version
        return input as UserSettingsDataV2
      
      default:
        throw new Error(`Unknown settings version: ${(input as any).version}`)
    }
  }
}

// Create singleton repository
const settingsRepo = new SingletonRepository(
  supabase,
  'user_settings',
  UserSettings,
  SETTINGS_VERSION,
  () => ({
    version: SETTINGS_VERSION,
    typeName: 'user_settings',
    theme: 'auto',
    notifications: {
      email: true,
      push: false,
      sms: false
    },
    language: 'en'
  })
)

// Usage examples
async function settingsExamples() {
  // Get settings (creates default if doesn't exist)
  const settings = await settingsRepo.get()
  console.log('Current theme:', settings.data.theme)
  
  // Update settings
  const updated = settings
    .setTheme('dark')
    .toggleEmailNotifications()
  
  await settingsRepo.save(updated)
  
  // Settings are automatically migrated when loaded
  // No need to worry about old versions
}

// ============================================
// Example 3: Public document with update access
// ============================================

interface WikiPageDataV1 extends DatabaseStorable {
  version: 1
  typeName: 'wiki_pages'
  slug: string
  title: string
  content: string
  lastEditedBy: string
  publicRead: true // always public
  publicUpdate: boolean // configurable
}

// Current version (no migrations yet)
type WikiPageData = WikiPageDataV1
type WikiPageVersions = WikiPageDataV1
const WIKI_VERSION = 1

class WikiPage extends BaseClass<WikiPageData> {
  migrate(data: unknown): WikiPageData {
    const input = data as WikiPageVersions
    
    switch (input.version) {
      case undefined:
      case 1:
        return input as WikiPageDataV1
      
      default:
        throw new Error(`Unknown wiki page version: ${(input as any).version}`)
    }
  }
  
  updateContent(content: string, userId: string): WikiPage {
    return new WikiPage({
      ...this.data,
      content,
      lastEditedBy: userId
    })
  }
}

const wikiRepo = new Repository(
  supabase,
  'wiki_pages',
  WikiPage,
  WIKI_VERSION
)

// Usage
async function wikiExample() {
  const wiki = new WikiPage({
    version: WIKI_VERSION,
    typeName: 'wiki_pages',
    slug: 'getting-started',
    title: 'Getting Started Guide',
    content: '# Welcome\n\nThis is a public wiki page.',
    lastEditedBy: 'user-123',
    publicRead: true,
    publicUpdate: true // anyone can edit
  })
  
  const wikiId = await wikiRepo.save(wiki)
  
  // This page is now readable by anyone (even non-authenticated)
  // and editable by any authenticated user
}

export { 
  projectRepo, 
  settingsRepo, 
  wikiRepo,
  Project,
  UserSettings,
  WikiPage
}