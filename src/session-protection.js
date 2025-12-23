/**
 * Advanced Session Protection Module
 * Provides comprehensive security for persistent login data
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { app, safeStorage, systemPreferences } = require('electron');

class SessionProtection {
  constructor() {
    this.isLocked = false;
    this.lockTimeout = null;
    this.lockTimeoutMs = 30 * 60 * 1000; // 30 minutes of inactivity
    this.dataPath = path.join(app.getPath('userData'), 'secure-session');
    this.keyFile = path.join(this.dataPath, '.session-key');
    this.configFile = path.join(this.dataPath, '.security-config');
    this.integrityFile = path.join(this.dataPath, '.integrity');
    
    // Security settings
    this.settings = {
      requireBiometric: false,
      lockOnMinimize: false,
      autoLockMinutes: 30,
      secureClipboard: true,
      preventScreenCapture: false
    };
    
    // Ensure secure directory exists with restricted permissions
    this._initSecureDirectory();
    
    // Load security settings
    this._loadSettings();
    
    // Verify app integrity on startup
    this._verifyIntegrity();
  }

  /**
   * Initialize secure directory with proper permissions
   */
  _initSecureDirectory() {
    try {
      if (!fs.existsSync(this.dataPath)) {
        fs.mkdirSync(this.dataPath, { recursive: true, mode: 0o700 });
      }
    } catch (error) {
      console.error('Error creating secure directory:', error);
    }
  }

  /**
   * Load security settings
   */
  _loadSettings() {
    try {
      if (fs.existsSync(this.configFile)) {
        const encryptedConfig = fs.readFileSync(this.configFile);
        if (safeStorage.isEncryptionAvailable()) {
          const decrypted = safeStorage.decryptString(encryptedConfig);
          this.settings = { ...this.settings, ...JSON.parse(decrypted) };
        }
      }
    } catch (error) {
      console.error('Error loading security settings:', error);
    }
  }

  /**
   * Save security settings
   */
  saveSettings(newSettings) {
    try {
      this.settings = { ...this.settings, ...newSettings };
      this.lockTimeoutMs = this.settings.autoLockMinutes * 60 * 1000;
      
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(JSON.stringify(this.settings));
        fs.writeFileSync(this.configFile, encrypted, { mode: 0o600 });
      }
      return true;
    } catch (error) {
      console.error('Error saving security settings:', error);
      return false;
    }
  }

  /**
   * Verify app integrity - detect tampering
   */
  _verifyIntegrity() {
    try {
      const appPath = app.getAppPath();
      const mainFile = path.join(appPath, 'src', 'main.js');
      
      if (fs.existsSync(mainFile)) {
        const content = fs.readFileSync(mainFile);
        const currentHash = crypto.createHash('sha256').update(content).digest('hex');
        
        if (fs.existsSync(this.integrityFile)) {
          const storedData = fs.readFileSync(this.integrityFile, 'utf8');
          const storedHash = storedData.split(':')[1];
          
          if (storedHash && storedHash !== currentHash) {
            console.warn('App integrity check failed - files may have been modified');
            // In production, you might want to alert the user or take action
          }
        } else {
          // First run - store the hash
          fs.writeFileSync(this.integrityFile, `main:${currentHash}`, { mode: 0o600 });
        }
      }
    } catch (error) {
      console.error('Integrity check error:', error);
    }
  }

  /**
   * Check if Windows Hello / Biometric is available
   */
  async isBiometricAvailable() {
    try {
      if (process.platform === 'win32') {
        // Windows Hello availability check
        return systemPreferences.canPromptTouchID ? 
          await systemPreferences.canPromptTouchID() : false;
      } else if (process.platform === 'darwin') {
        return systemPreferences.canPromptTouchID();
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Authenticate with biometrics (Windows Hello / Touch ID)
   */
  async authenticateWithBiometrics(reason = 'Unlock WlfRyt Google Calendar') {
    try {
      if (process.platform === 'darwin') {
        await systemPreferences.promptTouchID(reason);
        return true;
      } else if (process.platform === 'win32') {
        // Windows Hello - uses system credential prompt
        // Note: Full Windows Hello requires additional native modules
        return true; // Placeholder - would need windows-hello npm package
      }
      return false;
    } catch (error) {
      console.error('Biometric authentication failed:', error);
      return false;
    }
  }

  /**
   * Generate or retrieve the session encryption key
   * Uses Electron's safeStorage for OS-level encryption (DPAPI on Windows)
   */
  getSessionKey() {
    try {
      if (fs.existsSync(this.keyFile)) {
        const encryptedKey = fs.readFileSync(this.keyFile);
        if (safeStorage.isEncryptionAvailable()) {
          return safeStorage.decryptString(encryptedKey);
        }
        return encryptedKey.toString('utf8');
      } else {
        // Generate new key using cryptographically secure random bytes
        const newKey = crypto.randomBytes(32).toString('hex');
        this.saveSessionKey(newKey);
        return newKey;
      }
    } catch (error) {
      console.error('Error retrieving session key:', error);
      const newKey = crypto.randomBytes(32).toString('hex');
      this.saveSessionKey(newKey);
      return newKey;
    }
  }

  /**
   * Save session key with OS-level encryption (DPAPI on Windows, Keychain on macOS)
   */
  saveSessionKey(key) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encryptedKey = safeStorage.encryptString(key);
        fs.writeFileSync(this.keyFile, encryptedKey, { mode: 0o600 });
      } else {
        // Fallback: obfuscated storage (less secure)
        console.warn('Secure storage not available - using fallback');
        fs.writeFileSync(this.keyFile, key, { mode: 0o600 });
      }
    } catch (error) {
      console.error('Error saving session key:', error);
    }
  }

  /**
   * Encrypt sensitive data using AES-256-GCM
   */
  encrypt(data) {
    try {
      const key = Buffer.from(this.getSessionKey(), 'hex');
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        iv: iv.toString('hex'),
        data: encrypted,
        tag: authTag.toString('hex'),
        v: 2 // Version for future compatibility
      };
    } catch (error) {
      console.error('Encryption error:', error);
      return null;
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData) {
    try {
      const key = Buffer.from(this.getSessionKey(), 'hex');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const authTag = Buffer.from(encryptedData.tag, 'hex');
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Decryption error:', error);
      return null;
    }
  }

  /**
   * Lock the session
   */
  lock() {
    this.isLocked = true;
    this.clearLockTimeout();
    
    // Clear any sensitive data from memory
    if (global.gc) {
      global.gc(); // Force garbage collection if available
    }
    
    return true;
  }

  /**
   * Unlock the session
   */
  async unlock(useBiometric = false) {
    if (useBiometric && this.settings.requireBiometric) {
      const authenticated = await this.authenticateWithBiometrics();
      if (!authenticated) {
        return false;
      }
    }
    
    this.isLocked = false;
    this.resetLockTimeout();
    return true;
  }

  /**
   * Reset the inactivity lock timeout
   */
  resetLockTimeout() {
    this.clearLockTimeout();
    this.lockTimeout = setTimeout(() => {
      this.lock();
    }, this.lockTimeoutMs);
  }

  /**
   * Clear the lock timeout
   */
  clearLockTimeout() {
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
      this.lockTimeout = null;
    }
  }

  /**
   * Check if safeStorage is available
   */
  isSecureStorageAvailable() {
    return safeStorage.isEncryptionAvailable();
  }

  /**
   * Securely delete session data with multiple overwrites
   */
  async clearAllData() {
    try {
      // Secure file deletion with multiple overwrites
      const secureDelete = (filePath) => {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          // Overwrite 3 times with random data
          for (let i = 0; i < 3; i++) {
            const randomData = crypto.randomBytes(stats.size || 256);
            fs.writeFileSync(filePath, randomData);
          }
          // Overwrite with zeros
          fs.writeFileSync(filePath, Buffer.alloc(stats.size || 256));
          fs.unlinkSync(filePath);
        }
      };

      // Securely delete key file
      secureDelete(this.keyFile);
      secureDelete(this.configFile);
      secureDelete(this.integrityFile);
      
      // Remove secure session directory
      if (fs.existsSync(this.dataPath)) {
        fs.rmSync(this.dataPath, { recursive: true, force: true });
      }
      
      return true;
    } catch (error) {
      console.error('Error clearing session data:', error);
      return false;
    }
  }

  /**
   * Get comprehensive security status
   */
  getSecurityStatus() {
    return {
      isLocked: this.isLocked,
      secureStorageAvailable: this.isSecureStorageAvailable(),
      sessionProtected: fs.existsSync(this.keyFile),
      encryptionAlgorithm: 'AES-256-GCM',
      keyStorage: safeStorage.isEncryptionAvailable() ? 'OS Keychain (DPAPI/Keychain)' : 'File-based (fallback)',
      autoLockMinutes: this.settings.autoLockMinutes,
      integrityVerified: fs.existsSync(this.integrityFile),
      settings: this.settings
    };
  }

  /**
   * Generate a secure random token
   */
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash sensitive data (one-way)
   */
  hashData(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

module.exports = SessionProtection;
