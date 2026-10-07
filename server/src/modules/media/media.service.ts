import { prisma } from "../../config/database";
import { NotFoundError } from "../../utils/errors";

export class MediaService {
  async getMediaByFilename(filename: string) {
    const media = await prisma.mediaFile.findUnique({
      where: { filename },
    });

    if (!media) {
      throw new NotFoundError(`Media file ${filename} not found`);
    }

    return media;
  }
}

export const mediaService = new MediaService();
