/*
  # Normalize Licence Status Values

  1. Purpose
    - Standardize licence_status values across all members
    - Handle variations in status naming (French, English, with spaces, etc.)
  
  2. Changes
    - Normalize 'actif' variations to 'actif'
    - Normalize 'en attente' variations to 'en_attente'
    - Normalize 'déclaré partant' variations to 'declare_partant'
    - Normalize 'parti' and 'transfert' variations to 'parti'
    - Normalize 'inactif' variations to 'inactif'
    - Normalize 'suspendu' variations to 'suspendu'
  
  3. Notes
    - Case-insensitive matching for all status values
    - Handles common variations and typos
*/

-- Normalize actif status
UPDATE members SET licence_status = 'actif'
WHERE licence_status ILIKE 'actif%' 
  OR licence_status ILIKE 'active%';

-- Normalize en_attente status
UPDATE members SET licence_status = 'en_attente'
WHERE licence_status ILIKE 'en attente%'
  OR licence_status ILIKE 'attente%'
  OR licence_status ILIKE 'pending%';

-- Normalize declare_partant status
UPDATE members SET licence_status = 'declare_partant'
WHERE licence_status ILIKE 'déclaré partant%'
  OR licence_status ILIKE 'declare partant%'
  OR licence_status ILIKE 'partant%';

-- Normalize parti status
UPDATE members SET licence_status = 'parti'
WHERE licence_status ILIKE 'parti%'
  OR licence_status ILIKE 'transfert%';

-- Normalize inactif status
UPDATE members SET licence_status = 'inactif'
WHERE licence_status ILIKE 'inactif%'
  OR licence_status ILIKE 'inactive%';

-- Normalize suspendu status
UPDATE members SET licence_status = 'suspendu'
WHERE licence_status ILIKE 'suspendu%'
  OR licence_status ILIKE 'suspended%';
