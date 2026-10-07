import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Product, Shop } from '../../types';
import { compressImageClientSide } from '../../utils/format';
import { buildProductSavePayload, createProductDraft, productToDraft } from './productForm';
import type { ProductModifierGroupDraft } from './productForm';
import { useToast } from '../Toast';

const MAX_GALLERY_IMAGES = 6;

export function useMerchantProductEditor(
  currentShop: Shop | null,
  setProducts: Dispatch<SetStateAction<Product[]>>,
) {
  const toast = useToast();
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prodTitle, setProdTitle] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodDescription, setProdDescription] = useState('');
  const [prodPrice, setProdPrice] = useState<number | ''>('');
  const [prodStock, setProdStock] = useState<number | ''>(10);
  const [prodImage, setProdImage] = useState('');
  const [prodLookbookImage, setProdLookbookImage] = useState('');
  const [prodGalleryImages, setProdGalleryImages] = useState<string[]>([]);
  const [prodSizes, setProdSizes] = useState('');
  const [prodColors, setProdColors] = useState('');
  const [prodPrepTime, setProdPrepTime] = useState<number | ''>('');
  const [prodModifierGroups, setProdModifierGroups] = useState<ProductModifierGroupDraft[]>([]);
  const [prodAttributes, setProdAttributes] = useState<Record<string, string>>({});
  const [prodIsAvailable, setProdIsAvailable] = useState(true);
  const [imageCompressing, setImageCompressing] = useState(false);
  const [compressedSizeKB, setCompressedSizeKB] = useState<number | null>(null);
  const [originalImageSizeKB, setOriginalImageSizeKB] = useState<number | null>(null);

  const handleOpenAddModal = () => {
    const draft = createProductDraft(currentShop?.category);
    setEditingProduct(null);
    setProdTitle(draft.title);
    setProdCategory(draft.category);
    setProdDescription(draft.description);
    setProdPrice(draft.price);
    setProdStock(draft.stock);
    setProdLookbookImage(draft.lookbook_image);
    setProdImage(draft.image_url);
    setProdGalleryImages(draft.gallery_images);
    setProdSizes(draft.sizes);
    setProdColors(draft.colors);
    setProdPrepTime(draft.prep_time);
    setProdModifierGroups(draft.modifier_groups);
    setProdAttributes(draft.attributes);
    setProdIsAvailable(draft.is_available);
    setCompressedSizeKB(null);
    setOriginalImageSizeKB(null);
    setIsProductModalOpen(true);
  };

  const handleOpenEditModal = (product: Product) => {
    const draft = productToDraft(product);
    setEditingProduct(product);
    setProdTitle(draft.title);
    setProdCategory(draft.category);
    setProdDescription(draft.description);
    setProdPrice(draft.price);
    setProdStock(draft.stock);
    setProdImage(draft.image_url);
    setProdLookbookImage(draft.lookbook_image);
    setProdGalleryImages(draft.gallery_images);
    setProdSizes(draft.sizes);
    setProdColors(draft.colors);
    setProdPrepTime(draft.prep_time);
    setProdModifierGroups(draft.modifier_groups);
    setProdAttributes(draft.attributes);
    setProdIsAvailable(draft.is_available);
    setCompressedSizeKB(null);
    setOriginalImageSizeKB(null);
    setIsProductModalOpen(true);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      toast.error('Choisissez une image de 8 Mo maximum.');
      event.target.value = '';
      return;
    }

    try {
      setImageCompressing(true);
      setOriginalImageSizeKB(Math.round(file.size / 1024));
      const { dataUrl, sizeKB } = await compressImageClientSide(file, 900, 100);
      setProdImage(dataUrl);
      setCompressedSizeKB(sizeKB);
    } catch {
      toast.error("Erreur lors de la compression de l'image.");
    } finally {
      setImageCompressing(false);
      event.target.value = '';
    }
  };

  const handleLookbookImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      toast.error('Choisissez une image de 8 Mo maximum.');
      event.target.value = '';
      return;
    }

    try {
      const { dataUrl } = await compressImageClientSide(file, 900, 100);
      setProdLookbookImage(dataUrl);
    } catch {
      toast.error("Erreur lors de la compression de l'image.");
    }
    event.target.value = '';
  };

  const handleGalleryImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    if (prodGalleryImages.length >= MAX_GALLERY_IMAGES) {
      toast.error(`Vous pouvez ajouter jusqu'à ${MAX_GALLERY_IMAGES} photos supplémentaires.`);
      event.target.value = '';
      return;
    }

    const remainingSlots = MAX_GALLERY_IMAGES - prodGalleryImages.length;
    const filesToProcess = files.slice(0, remainingSlots);
    const oversized = filesToProcess.some((file) => !file.type.startsWith('image/') || file.size > 8 * 1024 * 1024);
    if (oversized) {
      toast.error('Choisissez des images de 8 Mo maximum.');
      event.target.value = '';
      return;
    }

    try {
      const compressed = await Promise.all(filesToProcess.map((file) => compressImageClientSide(file, 900, 100)));
      setProdGalleryImages((previous) => [...previous, ...compressed.map((result) => result.dataUrl)]);
    } catch {
      toast.error("Erreur lors de la compression d'une photo.");
    }
    event.target.value = '';
  };

  const handleRemoveGalleryImage = (index: number) => {
    setProdGalleryImages((previous) => previous.filter((_, imageIndex) => imageIndex !== index));
  };

  const handleSaveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentShop || !prodTitle.trim() || prodPrice === '') return;

    const payload = buildProductSavePayload({
      title: prodTitle.trim(),
      category: prodCategory,
      description: prodDescription,
      price: prodPrice,
      stock: prodStock,
      image_url: prodImage,
      lookbook_image: prodLookbookImage,
      gallery_images: prodGalleryImages,
      sizes: prodSizes,
      colors: prodColors,
      prep_time: prodPrepTime,
      modifier_groups: prodModifierGroups,
      attributes: prodAttributes,
      is_available: prodIsAvailable,
    }, currentShop.category);

    try {
      if (editingProduct) {
        const response = await fetch(`/api/shops/${currentShop.id}/products/${editingProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (response.ok) {
          const data = await response.json();
          setProducts((previous) => previous.map((product) => product.id === editingProduct.id ? data.product : product));
          setIsProductModalOpen(false);
          toast.success('Article modifié avec succès !');
        } else {
          const data = await response.json().catch(() => ({}));
          toast.error(data.error || "Impossible de modifier l'article.");
        }
      } else {
        const response = await fetch(`/api/shops/${currentShop.id}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (response.ok) {
          const data = await response.json();
          setProducts((previous) => [data.product, ...previous]);
          setIsProductModalOpen(false);
          toast.success('Article ajouté au catalogue !');
        } else {
          const data = await response.json().catch(() => ({}));
          toast.error(data.error || "Impossible d'ajouter l'article.");
        }
      }
    } catch {
      toast.error("Erreur lors de l'enregistrement de l'article");
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    if (!currentShop) return;
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet article du catalogue ?')) return;

    try {
      const response = await fetch(`/api/shops/${currentShop.id}/products/${productId}`, { method: 'DELETE' });
      if (response.ok) {
        setProducts((previous) => previous.filter((product) => product.id !== productId));
        toast.success('Article supprimé du catalogue.');
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || "Impossible de supprimer l'article.");
      }
    } catch {
      toast.error("Erreur lors de la suppression de l'article");
    }
  };

  return {
    isProductModalOpen,
    editingProduct,
    prodTitle,
    prodCategory,
    prodDescription,
    prodPrice,
    prodStock,
    prodImage,
    prodLookbookImage,
    prodGalleryImages,
    prodSizes,
    prodColors,
    prodPrepTime,
    prodModifierGroups,
    prodAttributes,
    prodIsAvailable,
    imageCompressing,
    compressedSizeKB,
    originalImageSizeKB,
    setIsProductModalOpen,
    setEditingProduct,
    setProdTitle,
    setProdCategory,
    setProdDescription,
    setProdPrice,
    setProdStock,
    setProdImage,
    setProdLookbookImage,
    setProdGalleryImages,
    setProdSizes,
    setProdColors,
    setProdPrepTime,
    setProdModifierGroups,
    setProdAttributes,
    setProdIsAvailable,
    setImageCompressing,
    setCompressedSizeKB,
    setOriginalImageSizeKB,
    handleOpenAddModal,
    handleOpenEditModal,
    handleImageUpload,
    handleLookbookImageUpload,
    handleGalleryImageUpload,
    handleRemoveGalleryImage,
    handleSaveProduct,
    handleDeleteProduct,
  };
}
