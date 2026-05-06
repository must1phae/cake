import { useLoader, useFrame, type ThreeEvent } from "@react-three/fiber";
import type { ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useThree } from "@react-three/fiber";
import { useTexture, useCursor } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Box3,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
  DoubleSide,
  Group,
  Quaternion,
  Euler,
} from "three";

type PictureFrameProps = Omit<ThreeElements["group"], "position" | "rotation" | "id"> & {
  image: string;
  imageScale?: number | [number, number];
  imageOffset?: [number, number, number];
  imageInset?: number;
  id?: string;
  isActive?: boolean;
  onToggle?: (id: string) => void;
  position?: [number, number, number];
  rotation?: [number, number, number];
};

const DEFAULT_IMAGE_SCALE: [number, number] = [0.82, 0.82];
const CAMERA_DISTANCE = 1.8;
const CAMERA_Y_FLOOR = 0.8;
const HOVER_LIFT = 0.04;

export function PictureFrame({
  id,
  isActive = false,
  onToggle,
  image,
  imageScale = DEFAULT_IMAGE_SCALE,
  imageOffset,
  imageInset = 0.01,
  children,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  ...groupProps
}: PictureFrameProps) {
  const { gl, camera } = useThree();
  const groupRef = useRef<Group>(null);
  const [isHovered, setIsHovered] = useState(false);

  useCursor(isHovered || isActive, "pointer");

  const gltf = useLoader(GLTFLoader, "/picture_frame.glb");
  const pictureTexture = useTexture(image);

  pictureTexture.colorSpace = SRGBColorSpace;
  const maxAnisotropy =
    typeof gl.capabilities.getMaxAnisotropy === "function"
      ? gl.capabilities.getMaxAnisotropy()
      : 1;
  pictureTexture.anisotropy = maxAnisotropy;

  const frameScene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  const { frameSize, frameCenter } = useMemo(() => {
    const box = new Box3().setFromObject(frameScene);
    const size = new Vector3();
    const center = new Vector3();
    box.getSize(size);
    box.getCenter(center);
    return { frameSize: size, frameCenter: center };
  }, [frameScene]);

  const scaledImage = useMemo<[number, number]>(() => {
    if (Array.isArray(imageScale)) {
      return imageScale;
    }
    return [imageScale, imageScale];
  }, [imageScale]);

  const [imageScaleX, imageScaleY] = scaledImage;

  const imageWidth = frameSize.x * imageScaleX;
  const imageHeight = frameSize.y * imageScaleY;

  const [offsetX, offsetY, offsetZ] = imageOffset ?? [
    0,
    0.05,
    -0.27,
  ];

  const imagePosition: [number, number, number] = [
    frameCenter.x + offsetX,
    frameCenter.y + offsetY,
    frameCenter.z + offsetZ,
  ];

  const pictureMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        map: pictureTexture,
        roughness: 0.08,
        metalness: 0,
        side: DoubleSide,
      }),
    [pictureTexture]
  );

  useEffect(() => {
    return () => {
      pictureMaterial.dispose();
    };
  }, [pictureMaterial]);

  const defaultPosition = useMemo(
    () => new Vector3(...position),
    [position]
  );
  const defaultQuaternion = useMemo(() => {
    const euler = new Euler(...rotation);
    return new Quaternion().setFromEuler(euler);
  }, [rotation]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    group.position.copy(defaultPosition);
    group.quaternion.copy(defaultQuaternion);
  }, [defaultPosition, defaultQuaternion]);

  useEffect(() => {
    if (!isActive) {
      setIsHovered(false);
    }
  }, [isActive]);

  const tmpPosition = useMemo(() => new Vector3(), []);
  const tmpQuaternion = useMemo(() => new Quaternion(), []);
  const tmpDirection = useMemo(() => new Vector3(), []);
  const cameraOffset = useMemo(() => new Vector3(0, -0.05, 0), []);
  const activeRotationOffset = useMemo(() => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI), []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    const positionTarget = tmpPosition;
    const rotationTarget = tmpQuaternion;

    if (isActive) {
      positionTarget.copy(camera.position);
      positionTarget.add(
        tmpDirection
          .copy(camera.getWorldDirection(tmpDirection))
          .multiplyScalar(CAMERA_DISTANCE)
      );
      positionTarget.add(cameraOffset);
      if (positionTarget.y < CAMERA_Y_FLOOR) {
        positionTarget.y = CAMERA_Y_FLOOR;
      }

      rotationTarget.copy(camera.quaternion).multiply(activeRotationOffset);
    } else {
      positionTarget.copy(defaultPosition);
      if (isHovered) {
        positionTarget.y += HOVER_LIFT;
      }
      rotationTarget.copy(defaultQuaternion);
    }

    const lerpAlpha = 1 - Math.exp(-delta * 12);
    const slerpAlpha = 1 - Math.exp(-delta * 10);

    group.position.lerp(positionTarget, lerpAlpha);
    group.quaternion.slerp(rotationTarget, slerpAlpha);
  });

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (!isActive) {
        setIsHovered(true);
      }
    },
    [isActive]
  );

  const handlePointerOut = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setIsHovered(false);
  }, []);

  const handlePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
  }, []);

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      if (id && onToggle) {
        onToggle(id);
      }
    },
    [id, onToggle]
  );

  return (
    <group
      ref={groupRef}
      {...groupProps}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <group rotation={[0.04, 0, 0]}>
        <primitive object={frameScene} />
        <mesh position={imagePosition} rotation={[0.435, Math.PI, 0]} material={pictureMaterial}>
          <planeGeometry args={[imageWidth, imageHeight]} />
        </mesh>
        {children}
      </group>
    </group>
  );
}
