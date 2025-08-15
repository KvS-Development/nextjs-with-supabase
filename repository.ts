import { createClient } from '@supabase/supabase-js'

// Base interfaces
interface DatabaseStorable {
  version: number
  typeName: string
  publicRead?: boolean
  publicUpdate?: boolean
}

// Base class for documents
abstract class BaseClass<TData extends DatabaseStorable> {
  constructor(public data: TData) {}
  
  abstract migrate(data: unknown): TData
  
  toJSON(): TData {
    return this.data
  }
}

// Repository for regular documents (multiple per user)
class Repository<TClass extends BaseClass<TData>, TData extends DatabaseStorable> {
  constructor(
    private supabase: ReturnType<typeof createClient>,
    private typeName: string,
    private classConstructor: new (data: TData) => TClass,
    private currentVersion: number
  ) {}
  
  private migrate(data: unknown): TData {
    // Create a temporary instance just to use its migrate method
    const temp = new this.classConstructor({} as TData)
    return temp.migrate(data)
  }
  
  async save(document: TClass): Promise<string> {
    const userId = (await this.supabase.auth.getUser()).data.user?.id
    if (!userId) throw new Error('User not authenticated')
    
    // Ensure data has correct type name and version
    const data = {
      ...document.data,
      typeName: this.typeName,
      version: this.currentVersion
    }
    
    const { data: result, error } = await this.supabase
      .from('user_data')
      .insert({
        user_id: userId,
        type_name: this.typeName,
        data
      })
      .select()
      .single()
    
    if (error) throw error
    return result.id
  }
  
  async update(id: string, document: TClass): Promise<void> {
    const data = {
      ...document.data,
      typeName: this.typeName,
      version: this.currentVersion
    }
    
    const { error } = await this.supabase
      .from('user_data')
      .update({ data })
      .eq('id', id)
    
    if (error) throw error
  }
  
  async get(id: string): Promise<TClass | null> {
    const { data, error } = await this.supabase
      .from('user_data')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      throw error
    }
    
    const migrated = this.migrate(data.data)
    return new this.classConstructor(migrated)
  }
  
  async list(options?: { 
    limit?: number
    offset?: number
    orderBy?: keyof TData
    ascending?: boolean
  }): Promise<Array<{ id: string; document: TClass; metadata: { created: Date; updated: Date } }>> {
    let query = this.supabase
      .from('user_data')
      .select('*')
      .eq('type_name', this.typeName)
    
    if (options?.orderBy) {
      query = query.order(`data->${String(options.orderBy)}`, { 
        ascending: options.ascending ?? true 
      })
    } else {
      query = query.order('created_at', { ascending: false })
    }
    
    if (options?.limit) query = query.limit(options.limit)
    if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 10) - 1)
    
    const { data, error } = await query
    
    if (error) throw error
    
    return (data || []).map(row => ({
      id: row.id,
      document: new this.classConstructor(this.migrate(row.data)),
      metadata: {
        created: new Date(row.created_at),
        updated: new Date(row.updated_at)
      }
    }))
  }
  
  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('user_data')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }
  
  async search(searchTerm: string, fields: (keyof TData)[]): Promise<Array<{ id: string; document: TClass }>> {
    // Build the search condition
    const conditions = fields
      .map(field => `data->>'${String(field)}' ILIKE '%${searchTerm}%'`)
      .join(' OR ')
    
    const { data, error } = await this.supabase
      .from('user_data')
      .select('*')
      .eq('type_name', this.typeName)
      .or(conditions)
    
    if (error) throw error
    
    return (data || []).map(row => ({
      id: row.id,
      document: new this.classConstructor(this.migrate(row.data))
    }))
  }
}

// Singleton repository (one per user)
class SingletonRepository<TClass extends BaseClass<TData>, TData extends DatabaseStorable> {
  constructor(
    private supabase: ReturnType<typeof createClient>,
    private typeName: string,
    private classConstructor: new (data: TData) => TClass,
    private currentVersion: number,
    private defaultData: () => TData
  ) {}
  
  private migrate(data: unknown): TData {
    const temp = new this.classConstructor({} as TData)
    return temp.migrate(data)
  }
  
  private async getDeterministicId(): Promise<string> {
    const userId = (await this.supabase.auth.getUser()).data.user?.id
    if (!userId) throw new Error('User not authenticated')
    // Create a deterministic ID from user and type
    return `${this.typeName}_${userId}`
  }
  
  async get(): Promise<TClass> {
    const id = await this.getDeterministicId()
    const userId = (await this.supabase.auth.getUser()).data.user?.id!
    
    const { data, error } = await this.supabase
      .from('user_data')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        // Not found, create default
        const defaultDoc = {
          ...this.defaultData(),
          typeName: this.typeName,
          version: this.currentVersion
        }
        
        const { error: insertError } = await this.supabase
          .from('user_data')
          .insert({
            id,
            user_id: userId,
            type_name: this.typeName,
            data: defaultDoc
          })
        
        if (insertError && insertError.code !== '23505') { // 23505 is duplicate key
          throw insertError
        }
        
        return new this.classConstructor(defaultDoc)
      }
      throw error
    }
    
    const migrated = this.migrate(data.data)
    return new this.classConstructor(migrated)
  }
  
  async save(document: TClass): Promise<void> {
    const id = await this.getDeterministicId()
    const userId = (await this.supabase.auth.getUser()).data.user?.id!
    
    const data = {
      ...document.data,
      typeName: this.typeName,
      version: this.currentVersion
    }
    
    const { error } = await this.supabase
      .from('user_data')
      .upsert({
        id,
        user_id: userId,
        type_name: this.typeName,
        data
      })
    
    if (error) throw error
  }
  
  async delete(): Promise<void> {
    const id = await this.getDeterministicId()
    
    const { error } = await this.supabase
      .from('user_data')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }
}

export { 
  Repository, 
  SingletonRepository, 
  BaseClass, 
  DatabaseStorable
}