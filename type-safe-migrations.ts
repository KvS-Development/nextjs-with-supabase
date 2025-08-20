import { BaseClass, DatabaseStorable } from './repository'

// ============================================
// Approach 1: Strongly Typed Migration Chain
// ============================================

// Define all versions of your data
interface ProjectV1 extends DatabaseStorable {
  version: 1
  typeName: 'projects'
  title: string
  owner: string
  description: string
}

interface ProjectV2 extends DatabaseStorable {
  version: 2
  typeName: 'projects'
  title: string
  members: string[]
  description: string
  priority: number
}

interface ProjectV3 extends DatabaseStorable {
  version: 3
  typeName: 'projects'
  title: string
  members: string[]
  description: string
  priority: number
  tags: string[]
}

// Current version
type ProjectData = ProjectV3
const PROJECT_VERSION = 3


// ============================================
// Migration through Discriminated Union
// ============================================

type ProjectVersions = ProjectV1 | ProjectV2 | ProjectV3

class ProjectDocument extends BaseClass<ProjectV3> {
  migrate(data: ProjectVersions | unknown): ProjectV3 {
    // Runtime check but with better typing
    const typed = data as ProjectVersions
    
    switch (typed.version) {
      case undefined:
      case 1:
        const v1 = typed as ProjectV1
        return {
          version: 3,
          typeName: 'projects',
          title: v1.title,
          members: [v1.owner],
          description: v1.description,
          priority: 5,
          tags: []
        }
      
      case 2:
        const v2 = typed as ProjectV2
        return {
          ...v2,
          version: 3,
          tags: []
        }
      
      case 3:
        return typed as ProjectV3
      
      default:
        throw new Error(`Unknown version: ${(typed as any).version}`)
    }
  }
}

export {
  ProjectDocument,
}