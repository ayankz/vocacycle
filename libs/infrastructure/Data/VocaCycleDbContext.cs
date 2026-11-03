using Microsoft.EntityFrameworkCore;
using VocaCycle.Infrastructure.Models;
namespace VocaCycle.Infrastructure.Data;

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
        // Explicit zero means Pairs; do not let EF replace it with the legacy DB default.
        modelBuilder.Entity<AudioSession>().Property(s => s.ExamplesPerWord).HasDefaultValue(5).HasSentinel(5);
        modelBuilder.Entity<AudioSession>().HasIndex(s => s.RequestId).IsUnique();
        modelBuilder.Entity<Word>()
            .HasIndex(word => word.Text)
            .IsUnique()
            .HasFilter("\"DeletedAt\" IS NULL");
        modelBuilder.Entity<Word>().HasQueryFilter(word => word.DeletedAt == null);
        modelBuilder.Entity<WordExample>()
            .HasIndex(e => new { e.WordId, e.Position })
            .IsUnique();
        modelBuilder.Entity<AudioSessionWord>()
            .HasKey(sw => new { sw.AudioSessionId, sw.WordId });
    }

}