import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { User } from '@moija/client';

interface AuthState {
  currentUser: User | null;
  isLoading: boolean;
}

const initialState: AuthState = {
  currentUser: null,
  isLoading: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCurrentUser: (state, action: PayloadAction<User | null>) => {
      state.currentUser = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    logout: (state) => {
      state.currentUser = null;
    },
  },
});

export const { setCurrentUser, setLoading, logout } = authSlice.actions;
export default authSlice.reducer;
