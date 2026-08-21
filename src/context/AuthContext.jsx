import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext({
  user: null,
  profile: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch user profile from public.profiles
  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, is_active')
        .eq('id', userId)
        .single()

      if (error) {
        throw error
      }
      return data
    } catch (err) {
      console.error('Error fetching profile:', err)
      return null
    }
  }

  useEffect(() => {
    let isMounted = true

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!isMounted) return

        if (session?.user) {
          const profileData = await fetchProfile(session.user.id)
          if (!isMounted) return

          if (!profileData || !profileData.is_active) {
            await supabase.auth.signOut()
            setUser(null)
            setProfile(null)
          } else {
            setUser(session.user)
            setProfile(profileData)
          }
        } else {
          setUser(null)
          setProfile(null)
        }
      } catch (err) {
        console.error('Auth initialization error:', err)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return

      if (event === 'SIGNED_IN') {
        if (session) {
          const profileData = await fetchProfile(session.user.id)
          if (!isMounted) return

          if (!profileData || !profileData.is_active) {
            await supabase.auth.signOut()
            setUser(null)
            setProfile(null)
          } else {
            setUser(session.user)
            setProfile(profileData)
          }
        }
        setLoading(false)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
        setLoading(false)
      } else if (event === 'TOKEN_REFRESHED') {
        if (session) {
          setUser(session.user)
        }
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email, password) => {
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        throw error
      }

      const profileData = await fetchProfile(data.user.id)

      if (!profileData) {
        await supabase.auth.signOut()
        throw new Error('access-denied:profile-not-found')
      }

      if (!profileData.is_active) {
        await supabase.auth.signOut()
        throw new Error('access-denied:inactive-account')
      }

      setUser(data.user)
      setProfile(profileData)
      return { user: data.user, profile: profileData }
    } catch (err) {
      setUser(null)
      setProfile(null)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    setLoading(true)
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Error signing out:', err)
    } finally {
      setUser(null)
      setProfile(null)
      setLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
