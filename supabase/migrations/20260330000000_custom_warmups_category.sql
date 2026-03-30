-- Ajout de la colonne category aux custom_warmups
-- Permet le filtrage par categorie sur la page d'accueil (favoris)
ALTER TABLE custom_warmups ADD COLUMN IF NOT EXISTS category text DEFAULT NULL;
