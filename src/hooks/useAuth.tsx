import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type UserRole = 'doctor' | 'patient';

interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, role: UserRole) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const clearSessionAnalysisCache = () => {
    if (typeof window === 'undefined') return;
    const prefix = 'docassist:analysis:';
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(prefix)) {
        sessionStorage.removeItem(key);
      }
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer profile fetch with setTimeout to prevent deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        } else {
          clearSessionAnalysisCache();
          setProfile(null);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('Profile not found, checking if we can restore from metadata...');
          
          // Try to recover profile from auth metadata (handles case where DB was wiped but Auth user remains)
          const { data: { user } } = await supabase.auth.getUser();
          
          if (user && user.id === userId && user.user_metadata) {
            const { full_name, role } = user.user_metadata;
            
            if (full_name && role) {
              console.log('Restoring missing profile from auth metadata...');
              const { data: newProfile, error: insertError } = await supabase
                .from('profiles')
                .insert([
                  { 
                    id: userId,
                    full_name: full_name,
                    role: role
                  }
                ])
                .select()
                .single();
              
              if (!insertError && newProfile) {
                console.log('Profile restored successfully');
                setProfile(newProfile as Profile);
                return;
              } else {
                console.error('Failed to restore profile:', insertError);
              }
            }
          }
          
          // If we couldn't restore, just return (loading will be set to false in finally)
          return;
        }
        throw error;
      }
      setProfile(data as Profile);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string, role: UserRole) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          role: role,
        },
      },
    });

    if (!error && data.user && data.session) {
      // Manual profile creation fallback ONLY if we have a session (logged in)
      // If no session (e.g. email confirmation pending), we must rely on the DB trigger
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([
          { 
            id: data.user.id,
            full_name: fullName,
            role: role
          }
        ])
        .select()
        .single();
        
      if (profileError) {
        // If error is duplicate key, it means trigger worked, so we ignore
        if (profileError.code !== '23505') {
           console.error('Error creating profile fallback:', profileError);
        }
      }
    } else if (!error && data.user && !data.session) {
      console.log('Signup successful, waiting for email verification. Profile creation handled by DB trigger.');
    }

    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearSessionAnalysisCache();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
