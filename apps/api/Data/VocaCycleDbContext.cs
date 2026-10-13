using Microsoft.EntityFrameworkCore;
using VocaCycle.Api.Models;
namespace VocaCycle.Api.Data;

public class VocaCycleDbContext : DbContext
{
    public VocaCycleDbContext(DbContextOptions<VocaCycleDbContext> options)
        : base(options)
    {
    }

    public DbSet<Word> Words { get; set; }
    public DbSet<AudioSession> AudioSessions { get; set; }
    public DbSet<AudioSessionWord> AudioSessionWords { get; set; }
    public DbSet<WordExample> WordExamples { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Word>()
            .HasIndex(word => word.Text)
            .IsUnique();

        modelBuilder.Entity<AudioSessionWord>()
            .HasKey(sw => new { sw.AudioSessionId, sw.WordId });
    }

}