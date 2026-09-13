#[cfg(target_os = "windows")]
mod dpapi_win {
    #[repr(C)]
    struct DataBlob {
        cb_data: u32,
        pb_data: *mut u8,
    }

    #[link(name = "Crypt32")]
    extern "system" {
        fn CryptProtectData(
            p_data_in: *const DataBlob,
            sz_data_descr: *const u16,
            p_optional_entropy: *const DataBlob,
            pv_reserved: *mut std::ffi::c_void,
            p_prompt_struct: *mut std::ffi::c_void,
            dw_flags: u32,
            p_data_out: *mut DataBlob,
        ) -> i32;

        fn CryptUnprotectData(
            p_data_in: *const DataBlob,
            ppsz_data_descr: *mut *mut u16,
            p_optional_entropy: *const DataBlob,
            pv_reserved: *mut std::ffi::c_void,
            p_prompt_struct: *mut std::ffi::c_void,
            dw_flags: u32,
            p_data_out: *mut DataBlob,
        ) -> i32;

        fn LocalFree(h_mem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    }

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

    pub fn encrypt(data: &[u8]) -> Result<Vec<u8>, String> {
        let mut in_blob = DataBlob {
            cb_data: data.len() as u32,
            pb_data: data.as_ptr() as *mut u8,
        };
        let mut out_blob = DataBlob {
            cb_data: 0,
            pb_data: std::ptr::null_mut(),
        };

        let res = unsafe {
            CryptProtectData(
                &mut in_blob,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out_blob,
            )
        };

        if res == 0 || out_blob.pb_data.is_null() {
            return Err("DPAPI encryption failed".into());
        }

        let slice = unsafe { std::slice::from_raw_parts(out_blob.pb_data, out_blob.cb_data as usize) };
        let result = slice.to_vec();
        unsafe { LocalFree(out_blob.pb_data as *mut std::ffi::c_void) };
        Ok(result)
    }

    pub fn decrypt(data: &[u8]) -> Result<Vec<u8>, String> {
        let mut in_blob = DataBlob {
            cb_data: data.len() as u32,
            pb_data: data.as_ptr() as *mut u8,
        };
        let mut out_blob = DataBlob {
            cb_data: 0,
            pb_data: std::ptr::null_mut(),
        };

        let res = unsafe {
            CryptUnprotectData(
                &mut in_blob,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out_blob,
            )
        };

        if res == 0 || out_blob.pb_data.is_null() {
            return Err("DPAPI decryption failed".into());
        }

        let slice = unsafe { std::slice::from_raw_parts(out_blob.pb_data, out_blob.cb_data as usize) };
        let result = slice.to_vec();
        unsafe { LocalFree(out_blob.pb_data as *mut std::ffi::c_void) };
        Ok(result)
    }
}

#[cfg(target_os = "windows")]
pub fn encrypt_bytes(data: &[u8]) -> Result<Vec<u8>, String> {
    dpapi_win::encrypt(data)
}

#[cfg(target_os = "windows")]
pub fn decrypt_bytes(data: &[u8]) -> Result<Vec<u8>, String> {
    dpapi_win::decrypt(data)
}

#[cfg(not(target_os = "windows"))]
mod aes_fallback {
    use aes_gcm::{Aes256Gcm, Key, Nonce};
    use aes_gcm::aead::{Aead, KeyInit};
    use sha2::{Sha256, Digest};
    use rand::RngCore;

    const NONCE_LEN: usize = 12;

    /// Derives a 256-bit key from machine-specific identifiers
    /// (hostname + username). Not as strong as DPAPI but provides
    /// real encryption tied to the local user session.
    fn derive_machine_key() -> [u8; 32] {
        let hostname = hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "grapscreen-host".into());
        let username = std::env::var("USER")
            .or_else(|_| std::env::var("LOGNAME"))
            .unwrap_or_else(|_| "grapscreen-user".into());

        let seed = format!("grapScreen-vault::{}@{}", username, hostname);
        let mut hasher = Sha256::new();
        hasher.update(seed.as_bytes());
        let result = hasher.finalize();
        let mut key = [0u8; 32];
        key.copy_from_slice(&result);
        key
    }

    pub fn encrypt(data: &[u8]) -> Result<Vec<u8>, String> {
        let key_bytes = derive_machine_key();
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);

        let mut nonce_bytes = [0u8; NONCE_LEN];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, data)
            .map_err(|e| format!("AES-GCM encrypt failed: {e}"))?;

        // Prepend nonce (12 bytes) to ciphertext
        let mut output = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        output.extend_from_slice(&nonce_bytes);
        output.extend_from_slice(&ciphertext);
        Ok(output)
    }

    pub fn decrypt(data: &[u8]) -> Result<Vec<u8>, String> {
        if data.len() < NONCE_LEN {
            return Err("Encrypted data too short".into());
        }

        let key_bytes = derive_machine_key();
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);

        let nonce = Nonce::from_slice(&data[..NONCE_LEN]);
        let ciphertext = &data[NONCE_LEN..];

        cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| format!("AES-GCM decrypt failed: {e}"))
    }
}

#[cfg(not(target_os = "windows"))]
pub fn encrypt_bytes(data: &[u8]) -> Result<Vec<u8>, String> {
    aes_fallback::encrypt(data)
}

#[cfg(not(target_os = "windows"))]
pub fn decrypt_bytes(data: &[u8]) -> Result<Vec<u8>, String> {
    aes_fallback::decrypt(data)
}
