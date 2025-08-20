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

// Type-safe migration functions
function migrateV1toV2(v1: ProjectV1): ProjectV2 {
  return {
    version: 2,
    typeName: 'projects',
    title: v1.title,
    members: [v1.owner],
    description: v1.description,
    priority: 5
  }
}

function migrateV2toV3(v2: ProjectV2): ProjectV3 {
  return {
    ...v2,
    version: 3,
    tags: []
  }
}

// Type guards for each version
function isProjectV1(data: any): data is ProjectV1 {
  return !data.version || data.version === 1
}

function isProjectV2(data: any): data is ProjectV2 {
  return data.version === 2
}

function isProjectV3(data: any): data is ProjectV3 {
  return data.version === 3
}

class ProjectDocument extends BaseClass<ProjectData> {
  migrate(data: unknown): ProjectData {
    // Type-safe migration chain with guards
    if (isProjectV1(data)) {
      const v2 = migrateV1toV2(data)
      return migrateV2toV3(v2)
    }
    
    if (isProjectV2(data)) {
      return migrateV2toV3(data)
    }
    
    if (isProjectV3(data)) {
      return data
    }
    
    throw new Error(`Unknown project version: ${(data as any)?.version}`)
  }
}

// ============================================
// Approach 2: Generic Migration Builder
// ============================================

// Helper types
type VersionOf<T extends DatabaseStorable> = T['version']
type TypeNameOf<T extends DatabaseStorable> = T['typeName']

// Migration function type
type MigrationFn<TFrom extends DatabaseStorable, TTo extends DatabaseStorable> = 
  (from: TFrom) => TTo

// Builder for type-safe migrations
class MigrationBuilder<TCurrent extends DatabaseStorable> {
  private migrations: Map<number, (data: any) => any> = new Map()
  
  addMigration<TFrom extends DatabaseStorable>(
    fromVersion: VersionOf<TFrom>,
    toVersion: VersionOf<TCurrent>,
    migrate: MigrationFn<TFrom, TCurrent>
  ): this {
    this.migrations.set(fromVersion, migrate)
    return this
  }
  
  build(): (data: unknown) => TCurrent {
    return (data: unknown) => {
      const version = (data as any)?.version || 1
      const migration = this.migrations.get(version)
      
      if (migration) {
        return migration(data)
      }
      
      if (version === this.getCurrentVersion()) {
        return data as TCurrent
      }
      
      throw new Error(`No migration path from version ${version}`)
    }
  }
  
  private getCurrentVersion(): number {
    // Get the highest "to" version from migrations
    return Math.max(...Array.from(this.migrations.values()).map(fn => {
      // This is a simplification - in practice you'd track this better
      return 3
    }))
  }
}

// Usage with builder
const projectMigration = new MigrationBuilder<ProjectV3>()
  .addMigration<ProjectV1>(1, 3, (v1) => ({
    version: 3,
    typeName: 'projects',
    title: v1.title,
    members: [v1.owner],
    description: v1.description,
    priority: 5,
    tags: []
  }))
  .addMigration<ProjectV2>(2, 3, (v2) => ({
    ...v2,
    version: 3,
    tags: []
  }))
  .build()

// ============================================
// Approach 3: Validated Migration with Zod
// ============================================

import { z } from 'zod'

// Define schemas for each version
const ProjectV1Schema = z.object({
  version: z.literal(1).optional(),
  typeName: z.literal('projects'),
  title: z.string(),
  owner: z.string(),
  description: z.string()
})

const ProjectV2Schema = z.object({
  version: z.literal(2),
  typeName: z.literal('projects'),
  title: z.string(),
  members: z.array(z.string()),
  description: z.string(),
  priority: z.number()
})

const ProjectV3Schema = z.object({
  version: z.literal(3),
  typeName: z.literal('projects'),
  title: z.string(),
  members: z.array(z.string()),
  description: z.string(),
  priority: z.number(),
  tags: z.array(z.string())
})

// Union schema that handles all versions and migrations
const ProjectMigrationSchema = z.union([
  ProjectV1Schema.transform((v1): ProjectV3 => ({
    version: 3,
    typeName: 'projects',
    title: v1.title,
    members: [v1.owner],
    description: v1.description,
    priority: 5,
    tags: []
  })),
  ProjectV2Schema.transform((v2): ProjectV3 => ({
    ...v2,
    version: 3,
    tags: []
  })),
  ProjectV3Schema
])

class ProjectDocumentWithZod extends BaseClass<ProjectV3> {
  migrate(data: unknown): ProjectV3 {
    // Parse will validate and migrate in one step
    const result = ProjectMigrationSchema.safeParse(data)
    
    if (!result.success) {
      console.error('Migration validation failed:', result.error)
      throw new Error(`Invalid project data: ${result.error.message}`)
    }
    
    return result.data
  }
}

// ============================================
// Approach 4: Discriminated Union (Simplest)
// ============================================

type ProjectVersions = ProjectV1 | ProjectV2 | ProjectV3

class ProjectDocumentSimple extends BaseClass<ProjectV3> {
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

// ============================================
// Approach 5: Progressive Enhancement
// ============================================

// Base type that all versions share
interface ProjectBase extends DatabaseStorable {
  typeName: 'projects'
  title: string
  description: string
}

// Use intersection types for versions
type ProjectDataV1 = ProjectBase & {
  version: 1
  owner: string
}

type ProjectDataV2 = ProjectBase & {
  version: 2
  members: string[]
  priority: number
}

type ProjectDataV3 = ProjectBase & {
  version: 3
  members: string[]
  priority: number
  tags: string[]
}

// Helper to assert version transitions
function assertMigration<TFrom extends DatabaseStorable, TTo extends DatabaseStorable>(
  from: TFrom,
  to: TTo,
  assertions: {
    sameType?: boolean
    versionIncrement?: number
  } = {}
): TTo {
  if (assertions.sameType && from.typeName !== to.typeName) {
    throw new Error(`Type name mismatch: ${from.typeName} !== ${to.typeName}`)
  }
  
  if (assertions.versionIncrement && 
      to.version - from.version !== assertions.versionIncrement) {
    throw new Error(`Invalid version increment: ${from.version} -> ${to.version}`)
  }
  
  return to
}

// Usage
class SafeProjectDocument extends BaseClass<ProjectDataV3> {
  migrate(data: unknown): ProjectDataV3 {
    const input = data as ProjectDataV1 | ProjectDataV2 | ProjectDataV3
    
    if (!input.version || input.version === 1) {
      return assertMigration(input as ProjectDataV1, {
        version: 3,
        typeName: 'projects',
        title: input.title,
        members: [(input as ProjectDataV1).owner],
        description: input.description,
        priority: 5,
        tags: []
      }, { sameType: true })
    }
    
    if (input.version === 2) {
      return assertMigration(input as ProjectDataV2, {
        ...input,
        version: 3,
        tags: []
      }, { sameType: true, versionIncrement: 1 })
    }
    
    return input as ProjectDataV3
  }
}

export {
  // Approach 1 exports
  ProjectDocument,
  isProjectV1,
  isProjectV2,
  isProjectV3,
  
  // Approach 2 exports
  MigrationBuilder,
  
  // Approach 3 exports
  ProjectDocumentWithZod,
  ProjectMigrationSchema,
  
  // Approach 4 exports
  ProjectDocumentSimple,
  
  // Approach 5 exports
  SafeProjectDocument
}