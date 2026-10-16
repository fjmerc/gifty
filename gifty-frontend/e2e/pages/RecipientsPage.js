import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

/**
 * Recipients Page Object
 * Handles recipient management interactions
 */
export class RecipientsPage extends BasePage {
  constructor(page) {
    super(page);
    
    // Page elements
    this.addRecipientButton = this.page.getByRole('button', { name: /add.*recipient/i });
    this.recipientsList = this.page.locator('[data-testid="recipients-list"]');
    this.recipientCards = this.page.locator('[data-testid="recipient-card"]');
    this.searchInput = this.page.getByLabel(/search.*recipients/i);
    this.filterButton = this.page.getByRole('button', { name: /filter/i });
    
    // Empty state
    this.emptyState = this.page.locator('[data-testid="recipients-empty-state"]');
    this.emptyStateMessage = this.page.locator('[data-testid="empty-state-message"]');
    
    // Loading states
    this.loadingSpinner = this.page.locator('[data-testid="loading-spinner"]');
    this.skeletonCards = this.page.locator('[data-testid="skeleton-card"]');
    
    // Recipient card elements (for first recipient)
    this.firstRecipientCard = this.recipientCards.first();
    this.recipientName = this.firstRecipientCard.locator('[data-testid="recipient-name"]');
    this.recipientRelation = this.firstRecipientCard.locator('[data-testid="recipient-relation"]');
    this.recipientImage = this.firstRecipientCard.locator('img');
    this.editButton = this.firstRecipientCard.getByRole('button', { name: /edit/i });
    this.deleteButton = this.firstRecipientCard.getByRole('button', { name: /delete/i });
    this.viewProfileButton = this.firstRecipientCard.getByRole('button', { name: /view.*profile|profile/i });
    
    // Add/Edit recipient modal or form
    this.recipientModal = this.page.locator('[data-testid="recipient-modal"], [role="dialog"]');
    this.modalTitle = this.recipientModal.locator('h1, h2, h3, [data-testid="modal-title"]');
    this.nameInput = this.recipientModal.getByLabel(/name/i);
    this.relationInput = this.recipientModal.getByLabel(/relation/i);
    this.birthdateInput = this.recipientModal.getByLabel(/birth.*date|birthday/i);
    this.interestsInput = this.recipientModal.getByLabel(/interests/i);
    this.notesInput = this.recipientModal.getByLabel(/notes/i);
    this.saveButton = this.recipientModal.getByRole('button', { name: /save|add.*recipient/i });
    this.cancelButton = this.recipientModal.getByRole('button', { name: /cancel/i });
    this.closeButton = this.recipientModal.getByRole('button', { name: /close/i });
    
    // File upload
    this.imageUpload = this.recipientModal.locator('input[type="file"]');
    this.imagePreview = this.recipientModal.locator('[data-testid="image-preview"]');
    
    // Confirmation dialogs
    this.confirmDialog = this.page.locator('[data-testid="confirm-dialog"], [role="alertdialog"]');
    this.confirmDeleteButton = this.confirmDialog.getByRole('button', { name: /delete|confirm/i });
    this.cancelDeleteButton = this.confirmDialog.getByRole('button', { name: /cancel/i });
    
    // Tags and interests
    this.tagsContainer = this.page.locator('[data-testid="tags-container"]');
    this.tagChips = this.page.locator('[data-testid="tag-chip"]');
    
    // Success/error messages
    this.successMessage = this.page.locator('[data-testid="success-message"], .alert-success');
    this.errorMessage = this.page.locator('[data-testid="error-message"], .alert-error');
  }

  /**
   * Navigate to recipients page
   */
  async navigateToRecipients() {
    await this.navigate('/recipients');
    await this.waitForPageLoad();
  }

  /**
   * Add a new recipient
   * @param {Object} recipientData - Recipient information
   */
  async addRecipient(recipientData) {
    const {
      name,
      relation,
      birthdate,
      interests,
      notes,
      imagePath
    } = recipientData;

    await this.addRecipientButton.click();
    await this.waitForElement('[data-testid="recipient-modal"], [role="dialog"]');

    // Fill form fields
    if (name) await this.nameInput.fill(name);
    if (relation) await this.relationInput.fill(relation);
    if (birthdate) await this.birthdateInput.fill(birthdate);
    if (interests) await this.interestsInput.fill(interests);
    if (notes) await this.notesInput.fill(notes);
    
    // Upload image if provided
    if (imagePath) {
      await this.uploadRecipientImage(imagePath);
    }

    // Wait for API call and save
    const responsePromise = this.waitForAPIResponse('/api/recipients');
    await this.saveButton.click();
    await responsePromise;

    // Wait for modal to close and list to refresh
    await expect(this.recipientModal).not.toBeVisible();
    await this.waitForAPIResponse('/api/recipients'); // List refresh
  }

  /**
   * Edit an existing recipient
   * @param {string} recipientName - Name of recipient to edit
   * @param {Object} updatedData - Updated recipient information
   */
  async editRecipient(recipientName, updatedData) {
    // Find recipient card by name
    const recipientCard = this.page.locator(`[data-testid="recipient-card"]:has-text("${recipientName}")`);
    const editBtn = recipientCard.getByRole('button', { name: /edit/i });
    
    await editBtn.click();
    await this.waitForElement('[data-testid="recipient-modal"], [role="dialog"]');

    // Update fields
    if (updatedData.name) {
      await this.nameInput.clear();
      await this.nameInput.fill(updatedData.name);
    }
    if (updatedData.relation) {
      await this.relationInput.clear();
      await this.relationInput.fill(updatedData.relation);
    }
    if (updatedData.interests) {
      await this.interestsInput.clear();
      await this.interestsInput.fill(updatedData.interests);
    }

    // Save changes
    const responsePromise = this.waitForAPIResponse('/api/recipients');
    await this.saveButton.click();
    await responsePromise;

    await expect(this.recipientModal).not.toBeVisible();
  }

  /**
   * Delete a recipient
   * @param {string} recipientName - Name of recipient to delete
   */
  async deleteRecipient(recipientName) {
    const recipientCard = this.page.locator(`[data-testid="recipient-card"]:has-text("${recipientName}")`);
    const deleteBtn = recipientCard.getByRole('button', { name: /delete/i });
    
    await deleteBtn.click();
    await this.waitForElement('[data-testid="confirm-dialog"], [role="alertdialog"]');
    
    // Confirm deletion
    const responsePromise = this.waitForAPIResponse('/api/recipients');
    await this.confirmDeleteButton.click();
    await responsePromise;

    await expect(this.confirmDialog).not.toBeVisible();
  }

  /**
   * Search for recipients
   * @param {string} searchTerm - Search term
   */
  async searchRecipients(searchTerm) {
    await this.searchInput.fill(searchTerm);
    
    // Wait for search results
    await this.page.waitForTimeout(500); // Debounce
    await this.waitForAPIResponse('/api/recipients');
  }

  /**
   * View recipient profile
   * @param {string} recipientName - Name of recipient
   */
  async viewRecipientProfile(recipientName) {
    const recipientCard = this.page.locator(`[data-testid="recipient-card"]:has-text("${recipientName}")`);
    
    // Try profile button or click on card
    try {
      const profileBtn = recipientCard.getByRole('button', { name: /view.*profile|profile/i });
      await profileBtn.click();
    } catch {
      // Click on card itself
      await recipientCard.click();
    }
    
    await this.waitForURL('**/recipients/**');
  }

  /**
   * Upload recipient image
   * @param {string} imagePath - Path to image file
   */
  async uploadRecipientImage(imagePath) {
    await this.imageUpload.setInputFiles(imagePath);
    
    // Wait for preview to appear
    await expect(this.imagePreview).toBeVisible();
  }

  /**
   * Cancel add/edit operation
   */
  async cancelRecipientOperation() {
    try {
      await this.cancelButton.click();
    } catch {
      await this.closeButton.click();
    }
    
    await expect(this.recipientModal).not.toBeVisible();
  }

  /**
   * Verification methods
   */
  async expectRecipientsListVisible() {
    await expect(this.recipientsList).toBeVisible();
  }

  async expectRecipientExists(name) {
    const recipientCard = this.page.locator(`[data-testid="recipient-card"]:has-text("${name}")`);
    await expect(recipientCard).toBeVisible();
  }

  async expectRecipientNotExists(name) {
    const recipientCard = this.page.locator(`[data-testid="recipient-card"]:has-text("${name}")`);
    await expect(recipientCard).not.toBeVisible();
  }

  async expectEmptyState() {
    await expect(this.emptyState).toBeVisible();
    await expect(this.emptyStateMessage).toContainText(/no recipients|empty/i);
  }

  async expectRecipientCount(count) {
    await expect(this.recipientCards).toHaveCount(count);
  }

  async expectSuccessMessage(message) {
    await expect(this.successMessage).toBeVisible();
    if (message) {
      await expect(this.successMessage).toContainText(message);
    }
  }

  async expectErrorMessage(message) {
    await expect(this.errorMessage).toBeVisible();
    if (message) {
      await expect(this.errorMessage).toContainText(message);
    }
  }

  /**
   * Get recipient information
   * @param {string} recipientName - Name of recipient
   */
  async getRecipientInfo(recipientName) {
    const recipientCard = this.page.locator(`[data-testid="recipient-card"]:has-text("${recipientName}")`);
    
    return {
      name: await recipientCard.locator('[data-testid="recipient-name"]').textContent(),
      relation: await recipientCard.locator('[data-testid="recipient-relation"]').textContent(),
      hasImage: await recipientCard.locator('img').isVisible()
    };
  }

  /**
   * Wait for recipients to load
   */
  async waitForRecipientsLoad() {
    // Wait for either recipients list or empty state
    await Promise.race([
      this.expectRecipientsListVisible(),
      this.expectEmptyState()
    ]);
    
    // Ensure loading state is complete
    try {
      await expect(this.loadingSpinner).not.toBeVisible({ timeout: 10000 });
    } catch {
      // Spinner might not exist
    }
  }

  /**
   * Check form validation
   */
  async expectFormValidationError(field, message) {
    const errorElement = this.recipientModal.locator(`[data-testid="${field}-error"], .error`);
    await expect(errorElement).toBeVisible();
    if (message) {
      await expect(errorElement).toContainText(message);
    }
  }

  /**
   * Verify modal is closed
   */
  async expectModalClosed() {
    await expect(this.recipientModal).not.toBeVisible();
  }
}