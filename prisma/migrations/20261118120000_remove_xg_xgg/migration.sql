UPDATE "SizeGrid" SET "sizes" = array_remove(array_remove("sizes", 'XG'), 'XGG');
UPDATE "SizeGrid" SET "description" = 'PP ao GG baby look' WHERE "id" = 'g-babylook' AND "description" = 'PP ao XGG baby look';
UPDATE "SizeGrid" SET "description" = 'PP ao EXG' WHERE "id" = 'g-unissex' AND "description" = 'PP ao Extra XGG';
